import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { Receipt } from "./types";

/** Comprobantes de un servicio. RLS: solo llegan si quien pide ve el servicio. */
export async function listReceipts(serviceId: string): Promise<Receipt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes")
    .select("id, tipo_mime, tamano_bytes, nombre_archivo, created_at")
    .eq("servicio_id", serviceId)
    .order("created_at");

  if (error) throw new Error("No se pudieron cargar los comprobantes");
  return data.map((row) => ({
    id: row.id,
    mimeType: row.tipo_mime as Receipt["mimeType"],
    size: row.tamano_bytes,
    fileName: row.nombre_archivo,
    createdAt: row.created_at,
  }));
}

/** Ruta del archivo de un comprobante, si quien pide puede verlo (RLS). */
export async function getReceiptFile(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes")
    .select("ruta_archivo, nombre_archivo")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar el comprobante");
  return data ? { path: data.ruta_archivo, fileName: data.nombre_archivo } : null;
}
