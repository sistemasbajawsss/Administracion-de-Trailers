"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { isUuid } from "@/lib/utils/ids";
import { requireRole } from "@/lib/auth/get-current-user";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { removeReceiptFiles } from "@/lib/supabase/storage";
import { parseKm } from "@/lib/utils/mileage";

import {
  correctMileageSchema,
  deleteUnitSchema,
  normalizeEconomicNumber,
  sellUnitSchema,
  undoSaleSchema,
  unitSchema,
  type UnitInput,
} from "./schemas";
import { listUnitShopStays } from "./queries";
import type { UnitShopStay } from "./types";

const emptyToNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** Del formulario (camelCase, strings) a columnas de la BD. */
function toRow(unit: UnitInput) {
  return {
    numero_economico: normalizeEconomicNumber(unit.economicNumber),
    tipo: unit.type,
    operacion: unit.type === "camioneta" || unit.operation === "" ? null : unit.operation,
    estatus: unit.status,
    chofer_id: emptyToNull(unit.driverId),
    longitud_pies: unit.type === "caja" && unit.lengthFt ? Number(unit.lengthFt) : null,
    placas: emptyToNull(unit.plates),
    marca: emptyToNull(unit.make),
    modelo: emptyToNull(unit.model),
    anio: unit.year ? Number(unit.year) : null,
    vin: emptyToNull(unit.vin),
    notas: emptyToNull(unit.notes),
  };
}

function errorMessage(error: { code?: string; message?: string }) {
  if (error.code === "23505") {
    return error.message?.includes("vin")
      ? "Ya existe una unidad con ese VIN."
      : "Ya existe una unidad con ese número económico.";
  }
  // El candado de taller (BD) explica qué hacer: "registra su entrada" / "dale salida desde Taller".
  if (error.code === "23514" && error.message?.includes("Taller")) return error.message;
  if (error.code === "23514") return "Revisa los datos: hay un campo que no cumple las reglas.";
  if (error.code === "23503") return "El chofer elegido ya no existe.";
  if (error.code === "42501") return "No tienes permiso para modificar unidades.";
  return "No se pudo guardar la unidad. Inténtalo de nuevo.";
}

export async function createUnit(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return fail("Revisa los datos de la unidad.");

  const user = await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .insert({ ...toRow(parsed.data), created_by: user.id })
    .select("id")
    .single();
  if (error) return fail(errorMessage(error));

  revalidatePath("/unidades", "layout");
  return ok({ id: data.id });
}

export async function updateUnit(id: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Unidad no válida.");
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return fail("Revisa los datos de la unidad.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .update(toRow(parsed.data))
    .eq("id", id)
    .select("id");
  if (error) return fail(errorMessage(error));
  if (!data.length) return fail("La unidad no existe o no tienes permiso para editarla.");

  revalidatePath("/unidades", "layout");
  return ok();
}

/**
 * Elimina la unidad con todos sus servicios, gastos e historial (D5).
 * No se puede deshacer; queda un renglón en la bitácora de eliminaciones.
 */
export async function deleteUnit(id: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Unidad no válida.");
  const parsed = deleteUnitSchema.safeParse(input);
  if (!parsed.success) return fail("Escribe ELIMINAR REGISTRO para confirmar.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data: receiptPaths, error } = await supabase.rpc("eliminar_unidad", {
    p_unidad_id: id,
    p_confirmacion: parsed.data.confirmation,
  });
  if (error?.code === "P0002") return fail("La unidad ya no existe.");
  if (error?.code === "42501") return fail("Solo un administrador puede eliminar unidades.");
  if (error) return fail("No se pudo eliminar la unidad. Inténtalo de nuevo.");

  // Archivos de comprobantes de sus servicios (vigentes y en Eliminados).
  await removeReceiptFiles(supabase, receiptPaths);

  revalidatePath("/unidades", "layout");
  revalidatePath("/servicios", "layout");
  revalidatePath("/");
  revalidatePath("/mantenimientos");
  return ok();
}

/** Mensajes de las funciones de venta y de kilometraje: ya vienen en español y dicen qué corregir. */
function adminRpcErrorMessage(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "42501") return "Solo un administrador puede hacer esto.";
  if (["23505", "23514", "P0002"].includes(error.code ?? "") && error.message) return error.message;
  return fallback;
}

/** Pantallas donde cambia una unidad vendida (lista, ficha, Taller, Inicio, servicio nuevo). */
function revalidateSale() {
  revalidatePath("/unidades", "layout");
  revalidatePath("/taller");
  revalidatePath("/servicios/nuevo");
  revalidatePath("/");
  revalidatePath("/mantenimientos");
}

/** Marca la unidad como vendida (solo admin). Si estaba en taller, su entrada se cierra. */
export async function sellUnit(id: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Unidad no válida.");
  const parsed = sellUnitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos de la venta.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_unidad_vendida", {
    p_unidad_id: id,
    p_fecha: parsed.data.date,
    p_nota: parsed.data.note || undefined,
  });
  if (error) return fail(adminRpcErrorMessage(error, "No se pudo marcar como vendida. Inténtalo de nuevo."));

  revalidateSale();
  return ok();
}

/** Deshace la venta (solo admin, con motivo). La unidad regresa a Activo. */
export async function undoUnitSale(id: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Unidad no válida.");
  const parsed = undoSaleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Escribe el motivo.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("deshacer_venta", { p_unidad_id: id, p_motivo: parsed.data.reason });
  if (error) return fail(adminRpcErrorMessage(error, "No se pudo deshacer la venta. Inténtalo de nuevo."));

  revalidateSale();
  return ok();
}

/**
 * Siguiente tanda de estancias en taller de la ficha (scroll infinito). Es una
 * lectura: llama a queries.ts con la sesión del usuario (RLS aplica), ver
 * docs/ARQUITECTURA.md. Solo admin y gerente ven la ficha.
 */
export async function loadMoreShopStays(unitId: unknown, offset: unknown): Promise<ActionResult<UnitShopStay[]>> {
  if (!isUuid(unitId) || typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 100_000) {
    return fail("No se pudieron cargar más estancias.");
  }

  await requireRole(VIEW_ALL_ROLES);

  try {
    return ok((await listUnitShopStays(unitId, offset)).stays);
  } catch {
    return fail("No se pudieron cargar más estancias. Inténtalo de nuevo.");
  }
}
/**
 * Corrige el kilometraje de la unidad (solo admin, con motivo, 5F): odómetro
 * cambiado o error anterior. Desde esa fecha la cuenta sigue con el valor nuevo.
 */
export async function correctUnitMileage(id: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Unidad no válida.");
  const parsed = correctMileageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos de la corrección.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("corregir_kilometraje", {
    p_unidad_id: id,
    p_kilometraje: parseKm(parsed.data.mileage)!,
    p_fecha: parsed.data.date,
    p_motivo: parsed.data.reason,
  });
  if (error) return fail(adminRpcErrorMessage(error, "No se pudo corregir el kilometraje. Inténtalo de nuevo."));

  // El kilometraje actual se ve en la ficha y orienta los formularios de servicio y de taller.
  revalidatePath(`/unidades/${id}`);
  revalidatePath("/servicios/nuevo");
  revalidatePath("/taller/entrada");
  // El kilometraje mueve lo que falta de los mantenimientos (5F).
  revalidatePath("/mantenimientos");
  revalidatePath("/");
  return ok();
}
