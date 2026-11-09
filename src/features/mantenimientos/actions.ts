"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/ids";
import { parseKm } from "@/lib/utils/mileage";

import { copyMaintenanceSchema, maintenanceSchema, type MaintenanceInput } from "./schemas";

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
}

export async function createMaintenance(unitId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(unitId)) return fail("Unidad no válida.");
  const parsed = maintenanceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos del mantenimiento.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("mantenimientos_unidad").insert({ unidad_id: unitId, ...toRow(parsed.data) });
  if (error) return fail(errorMessage(error, "No se pudo agregar el mantenimiento. Inténtalo de nuevo."));

  revalidateMaintenance(unitId);
  return ok();
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

/** Copia los mantenimientos de otra unidad que esta aún no tiene. Regresa cuántos copió. */
export async function copyMaintenance(unitId: string, input: unknown): Promise<ActionResult<{ copied: number }>> {
  if (!isUuid(unitId)) return fail("Unidad no válida.");
  const parsed = copyMaintenanceSchema.safeParse(input);
  if (!parsed.success) return fail("Elige de qué unidad copiar.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copiar_mantenimientos", {
    p_origen: parsed.data.sourceUnitId,
    p_destino: unitId,
  });
  if (error) return fail(errorMessage(error, "No se pudieron copiar los mantenimientos. Inténtalo de nuevo."));

  revalidateMaintenance(unitId);
  return ok({ copied: data });
}
