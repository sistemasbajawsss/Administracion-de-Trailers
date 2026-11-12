"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES, VIEW_ALL_ROLES } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { todayInTijuana } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/ids";
import { describeCaptureDays, isWeeklyCaptureDay, parseKm } from "@/lib/utils/mileage";

import { getCaptureDays, listUnitReadings } from "./queries";
import { captureDaysSchema, correctReadingSchema, removeReadingSchema, saveReadingsSchema } from "./schemas";
import type { SaveReadingsResult, UnitReading } from "./types";

/** Los mensajes de la BD ya vienen en español y dicen qué hacer. */
function rpcErrorMessage(error: { code?: string; message?: string }, fallback: string) {
  if (["42501", "23505", "23514", "P0002", "22023"].includes(error.code ?? "") && error.message) {
    return error.message.includes("permission denied") ? "No tienes permiso para hacer esto." : error.message;
  }
  return fallback;
}

/** El kilometraje mueve la ficha, Mantenimientos, Inicio y los formularios que lo sugieren. */
function revalidateMileage() {
  revalidatePath("/kilometraje");
  revalidatePath("/");
  revalidatePath("/mantenimientos");
  revalidatePath("/unidades", "layout");
  revalidatePath("/servicios/nuevo");
  revalidatePath("/taller/entrada");
}

/**
 * Guarda el kilometraje semanal de varias unidades (5H, D15). Cada lectura se
 * guarda o se rechaza sola: regresa cuáles se guardaron y por qué no las demás.
 * El capturista solo en los días de registro que eligió el admin; el admin, cualquier día.
 */
export async function saveWeeklyReadings(input: unknown): Promise<ActionResult<SaveReadingsResult>> {
  const parsed = saveReadingsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los kilometrajes.");

  const user = await requireRole(CAPTURE_ROLES);
  if (user.role !== "admin") {
    const days = await getCaptureDays();
    if (!isWeeklyCaptureDay(todayInTijuana(), days)) {
      return fail(`El kilometraje semanal se registra ${describeCaptureDays(days)}.`);
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_lecturas_kilometraje", {
    p_lecturas: parsed.data.map((r) => ({ unidad_id: r.unitId, kilometraje: parseKm(r.km)! })),
  });
  if (error) return fail(rpcErrorMessage(error, "No se pudo guardar el kilometraje. Inténtalo de nuevo."));

  const result: SaveReadingsResult = {
    saved: data.filter((r) => r.lectura_id !== null).map((r) => r.unidad_id),
    rejected: data
      .filter((r) => r.lectura_id === null)
      .map((r) => ({ unitId: r.unidad_id, message: r.error ?? "No se guardó." })),
  };
  if (result.saved.length > 0) revalidateMileage();
  return ok(result);
}

/** Corrige una lectura: quien la capturó, el mismo día; después el admin, con motivo. */
export async function correctReading(id: unknown, input: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Lectura no válida.");
  const parsed = correctReadingSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa el kilometraje.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.rpc("corregir_lectura_kilometraje", {
    p_lectura_id: id,
    p_kilometraje: parseKm(parsed.data.km)!,
    p_motivo: parsed.data.reason || undefined,
  });
  if (error) return fail(rpcErrorMessage(error, "No se pudo corregir la lectura. Inténtalo de nuevo."));

  revalidateMileage();
  return ok();
}

/** Quita una lectura: quien la capturó, el mismo día; después el admin, con motivo. */
export async function removeReading(id: unknown, input: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Lectura no válida.");
  const parsed = removeReadingSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa el motivo.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_lectura_kilometraje", {
    p_lectura_id: id,
    p_motivo: parsed.data.reason || undefined,
  });
  if (error) return fail(rpcErrorMessage(error, "No se pudo quitar la lectura. Inténtalo de nuevo."));

  revalidateMileage();
  return ok();
}

/** Siguiente tanda de lecturas de la ficha (admin y gerente). */
export async function loadMoreUnitReadings(unitId: unknown, offset: unknown): Promise<ActionResult<UnitReading[]>> {
  if (!isUuid(unitId) || typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 100_000) {
    return fail("No se pudieron cargar más lecturas.");
  }

  await requireRole(VIEW_ALL_ROLES);

  try {
    return ok((await listUnitReadings(unitId, offset)).readings);
  } catch {
    return fail("No se pudieron cargar más lecturas. Inténtalo de nuevo.");
  }
}

/** Cambia los días de registro del kilometraje semanal (solo admin): uno o dos días de la semana. */
export async function setCaptureDays(input: unknown): Promise<ActionResult> {
  const parsed = captureDaysSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Elige uno o dos días.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cambiar_dias_captura_kilometraje", { p_dias: parsed.data });
  if (error) return fail(rpcErrorMessage(error, "No se pudieron cambiar los días. Inténtalo de nuevo."));

  revalidatePath("/kilometraje");
  revalidatePath("/");
  return ok();
}
