"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { removeReceiptFiles } from "@/lib/supabase/storage";

import { deleteUnitSchema, normalizeEconomicNumber, unitSchema, type UnitInput } from "./schemas";

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
  return ok();
}
