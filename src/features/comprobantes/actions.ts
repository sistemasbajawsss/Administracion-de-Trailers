"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { RECEIPTS_BUCKET, removeReceiptFiles } from "@/lib/supabase/storage";
import { MAX_RECEIPT_BYTES, detectFileType, extensionFor, type ReceiptMimeType } from "@/lib/utils/files";

import { duplicateCheckSchema, receiptRegisterSchema, receiptUploadSchema, removeReceiptSchema } from "./schemas";
import type { DuplicateReceipt, ReceiptUploadTicket } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Ruta del archivo: la arma el servidor, nunca el navegador (la BD exige este formato). */
const receiptPath = (serviceId: string, receiptId: string, mimeType: ReceiptMimeType) =>
  `${serviceId}/${receiptId}.${extensionFor(mimeType)}`;

function revalidateService(serviceId: string) {
  revalidatePath(`/servicios/${serviceId}`);
  // La marca "Editado" de las listas cambia al quitar un comprobante.
  revalidatePath("/servicios", "layout");
}

async function findDuplicate(supabase: Supabase, hash: string): Promise<DuplicateReceipt | null> {
  const { data, error } = await supabase.rpc("buscar_comprobante_duplicado", { p_hash: hash });
  const row = data?.[0];
  if (error || !row) return null;
  return {
    serviceId: row.servicio_id,
    economicNumber: row.numero_economico,
    date: row.fecha,
    canView: row.puede_ver,
  };
}

/**
 * ¿Este archivo ya está en algún servicio? El navegador pregunta antes de subir,
 * con el SHA-256 que calculó, para avisar a tiempo (D7).
 */
export async function findDuplicateReceipt(input: unknown): Promise<ActionResult<DuplicateReceipt | null>> {
  const parsed = duplicateCheckSchema.safeParse(input);
  if (!parsed.success) return fail("No se pudo revisar el archivo.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  return ok(await findDuplicate(supabase, parsed.data.hash));
}

/**
 * Paso 1 de la subida: revisa que el servicio se pueda editar y da una URL firmada
 * para subir un solo archivo directo a Storage (no pasa por el servidor de Next).
 */
export async function createReceiptUpload(input: unknown): Promise<ActionResult<ReceiptUploadTicket>> {
  const parsed = receiptUploadSchema.safeParse(input);
  if (!parsed.success) return fail("Solo se aceptan PDF o fotos de hasta 10 MB.");

  const user = await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { serviceId, mimeType } = parsed.data;

  // RLS: el capturista solo ve sus servicios. Además, solo edita los suyos.
  const { data: service } = await supabase
    .from("servicios")
    .select("id, created_by")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service || (user.role !== "admin" && service.created_by !== user.id)) {
    return fail("No puedes agregar comprobantes a este servicio.");
  }

  const receiptId = randomUUID();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUploadUrl(receiptPath(serviceId, receiptId, mimeType));
  if (error) return fail("No se pudo preparar la subida. Inténtalo de nuevo.");

  return ok({ receiptId, path: data.path, token: data.token });
}

/**
 * Paso 2: el archivo ya está en Storage. Se descarga y se revisa por dentro (firma
 * de bytes y tamaño), se calcula su SHA-256 aquí (no se confía en el del navegador)
 * y se registra. Si algo no cuadra, el archivo se borra.
 * Regresa el servicio donde ya estaba ese archivo, si lo había, para avisar.
 */
export async function registerReceipt(
  input: unknown,
): Promise<ActionResult<{ id: string; duplicateOf: DuplicateReceipt | null }>> {
  const parsed = receiptRegisterSchema.safeParse(input);
  if (!parsed.success) return fail("Revisa el archivo del comprobante.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { serviceId, receiptId, mimeType, fileName } = parsed.data;
  const path = receiptPath(serviceId, receiptId, mimeType);
  const discard = async (message: string) => {
    await removeReceiptFiles(supabase, [path]);
    return fail(message);
  };

  const { data: file, error: downloadError } = await supabase.storage.from(RECEIPTS_BUCKET).download(path);
  if (downloadError || !file) return fail("No se encontró el archivo subido. Inténtalo de nuevo.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RECEIPT_BYTES) {
    return discard("El archivo está vacío o pesa más de 10 MB.");
  }
  if (detectFileType(bytes) !== mimeType) {
    return discard("El archivo no es un PDF ni una foto válida.");
  }

  const hash = createHash("sha256").update(bytes).digest("hex");
  const duplicateOf = await findDuplicate(supabase, hash);

  const { error } = await supabase.from("comprobantes").insert({
    id: receiptId,
    servicio_id: serviceId,
    ruta_archivo: path,
    tipo_mime: mimeType,
    tamano_bytes: bytes.byteLength,
    hash_sha256: hash,
    nombre_archivo: fileName,
  });
  if (error?.code === "23505") return discard("Ese archivo ya está en este servicio.");
  if (error?.code === "23514" && error.message.includes("hasta 10")) {
    return discard("Un servicio puede tener hasta 10 comprobantes.");
  }
  if (error?.code === "42501") return discard("No puedes agregar comprobantes a este servicio.");
  if (error) return discard("No se pudo guardar el comprobante. Inténtalo de nuevo.");

  revalidateService(serviceId);
  return ok({ id: receiptId, duplicateOf: duplicateOf?.serviceId === serviceId ? null : duplicateOf });
}

/** Quita un comprobante con motivo (queda en la línea de cambios) y borra su archivo. */
export async function removeReceipt(receiptId: string, serviceId: string, input: unknown): Promise<ActionResult> {
  const parsed = removeReceiptSchema.safeParse(input);
  if (!parsed.success) return fail("Explica por qué se quita el comprobante.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("quitar_comprobante", {
    p_comprobante_id: receiptId,
    p_motivo: parsed.data.reason,
  });
  if (error?.code === "P0002") return fail("Ese comprobante ya no existe o no lo puedes quitar.");
  if (error) return fail("No se pudo quitar el comprobante. Inténtalo de nuevo.");

  await removeReceiptFiles(supabase, [path]);
  revalidateService(serviceId);
  return ok();
}
