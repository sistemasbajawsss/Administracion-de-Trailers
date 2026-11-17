"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/ids";
import { parseKm } from "@/lib/utils/mileage";

import { generalWarningSchema, maintenanceSchema, unitWarningSchema, type MaintenanceInput } from "./schemas";
import { APPLY_RESULTS, type ApplyOutcome, type ApplyResult } from "./types";

/** Del formulario a columnas de la BD (lo que no aplica va en null). */
function toRow(input: MaintenanceInput) {
  const everyKm = input.everyKm ? parseKm(input.everyKm) : null;
  return {
    nombre: input.name,
    cada_km: everyKm,
    cada_meses: input.everyMonths ? parseKm(input.everyMonths) : null,
    desde_fecha: input.lastDate,
    desde_km: everyKm && input.lastKm ? parseKm(input.lastKm) : null,
  };
}

/** Los mensajes de los triggers ya vienen en español; las reglas de la tabla se traducen aquí. */
function errorMessage(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "23505") return "Esta unidad ya tiene un mantenimiento con ese nombre.";
  if (error.code === "42501") return "Solo un administrador puede cambiar los mantenimientos.";
  if (error.code === "23514" && error.message && !error.message.includes("violates")) return error.message;
  if (error.code === "23514") return "Revisa los datos: hay un campo que no cumple las reglas.";
  if (error.code === "P0002" && error.message) return error.message;
  return fallback;
}

/** La ficha de la unidad, Inicio y (Etapa 4) la página Mantenimientos. */
function revalidateMaintenance(unitId: string) {
  revalidatePath(`/unidades/${unitId}`);
  revalidatePath("/");
  revalidatePath("/mantenimientos");
}

/**
 * Agrega el mantenimiento a esta unidad y, en la misma transacción, a las otras
 * elegidas (cuentan desde hoy y su km actual; las que ya lo tienen se saltan).
 * Regresa lo que pasó en cada unidad.
 */
export async function createMaintenance(unitId: string, input: unknown): Promise<ActionResult<{ outcomes: ApplyOutcome[] }>> {
  if (!isUuid(unitId)) return fail("Unidad no válida.");
  const parsed = maintenanceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos del mantenimiento.");

  await requireRole("admin");

  const row = toRow(parsed.data);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agregar_mantenimiento", {
    p_unidad_id: unitId,
    p_nombre: row.nombre,
    // La BD acepta null (los tipos generados no lo dicen).
    p_cada_km: row.cada_km as number,
    p_cada_meses: row.cada_meses as number,
    p_desde_fecha: row.desde_fecha,
    p_desde_km: row.desde_km as number,
    p_otras: parsed.data.alsoUnitIds.filter((id) => id !== unitId),
  });
  if (error) return fail(errorMessage(error, "No se pudo agregar el mantenimiento. Inténtalo de nuevo."));

  revalidateMaintenance(unitId);
  // La ficha de las otras unidades también cambió.
  if (data.length > 1) revalidatePath("/unidades/[id]", "page");
  return ok({
    outcomes: data
      .filter((d) => (APPLY_RESULTS as readonly string[]).includes(d.resultado))
      .map((d) => ({ unitId: d.unidad_id, economicNumber: d.numero_economico, result: d.resultado as ApplyResult })),
  });
}

export async function updateMaintenance(id: string, unitId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(id) || !isUuid(unitId)) return fail("Mantenimiento no válido.");
  const parsed = maintenanceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos del mantenimiento.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mantenimientos_unidad")
    .update(toRow(parsed.data))
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) return fail(errorMessage(error, "No se pudieron guardar los cambios. Inténtalo de nuevo."));
  if (!data.length) return fail("No se encontró el mantenimiento.");

  revalidateMaintenance(unitId);
  return ok();
}

/** Quitar = desactivar (los catálogos no se borran). */
export async function removeMaintenance(id: string, unitId: string): Promise<ActionResult> {
  if (!isUuid(id) || !isUuid(unitId)) return fail("Mantenimiento no válido.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mantenimientos_unidad")
    .update({ activo: false })
    .eq("id", id)
    .eq("activo", true)
    .select("id");
  if (error) return fail(errorMessage(error, "No se pudo quitar el mantenimiento. Inténtalo de nuevo."));
  if (!data.length) return fail("No se encontró el mantenimiento.");

  revalidateMaintenance(unitId);
  return ok();
}

/* ---------------------------------------------------------------------------
 * Aviso de kilometraje (5J): cuántos km antes se marca "Programar servicio".
 * Solo admin; la BD lo vuelve a revisar (rol, rango, unidades con odómetro).
 * ------------------------------------------------------------------------- */

function warningError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "42501") return "Solo un administrador puede cambiar el aviso de kilometraje.";
  if (error.code === "23503") return "Una de las unidades ya no existe. Recarga la página.";
  if (error.code === "23514" && error.message && !error.message.includes("violates")) return error.message;
  return fallback;
}

/** El aviso cambia lo que sale en Mantenimientos, en el Inicio y en cada ficha. */
function revalidateWarnings() {
  revalidatePath("/mantenimientos");
  revalidatePath("/");
  revalidatePath("/unidades/[id]", "page");
}

/** Cambia el aviso general (todas las unidades sin aviso propio). */
export async function setGeneralWarning(input: unknown): Promise<ActionResult<{ km: number }>> {
  const parsed = generalWarningSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa el aviso.");

  await requireRole("admin");

  const km = parseKm(parsed.data.km)!;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cambiar_aviso_mantenimiento", { p_aviso_km: km });
  if (error) return fail(warningError(error, "No se pudo guardar el aviso. Inténtalo de nuevo."));

  revalidateWarnings();
  return ok({ km });
}

/** Pone (o cambia) el aviso propio de una o varias unidades. Todo o nada. */
export async function setUnitWarning(input: unknown): Promise<ActionResult<{ count: number; km: number }>> {
  const parsed = unitWarningSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa el aviso.");

  await requireRole("admin");

  const km = parseKm(parsed.data.km)!;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("poner_aviso_mantenimiento", { p_unidades: parsed.data.unitIds, p_aviso_km: km });
  if (error) return fail(warningError(error, "No se pudo guardar el aviso. Inténtalo de nuevo."));

  revalidateWarnings();
  return ok({ count: data, km });
}

/** Quita el aviso propio de una unidad: vuelve al general. */
export async function removeUnitWarning(unitId: string): Promise<ActionResult> {
  if (!isUuid(unitId)) return fail("Unidad no válida.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_aviso_mantenimiento", { p_unidades: [unitId] });
  if (error) return fail(warningError(error, "No se pudo quitar el aviso. Inténtalo de nuevo."));

  revalidateWarnings();
  return ok();
}
