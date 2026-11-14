"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";

import { closeDaySchema, monthSchema, reopenMonthSchema } from "./schemas";

/** Mensajes de las funciones de cierre: ya vienen en español y dicen qué corregir. */
function errorMessage(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "42501") return "Solo un administrador puede hacer esto.";
  if (error.code === "23514" && error.message) return `${error.message}.`;
  return fallback;
}

/** Cerrar o reabrir cambia qué se puede capturar: Servicios, Inicio y Reportes. */
function revalidateClose() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/servicios", "layout");
  revalidatePath("/unidades", "layout");
  revalidatePath("/");
}

export async function closeMonth(month: unknown): Promise<ActionResult> {
  const parsed = monthSchema.safeParse(month);
  if (!parsed.success) return fail("Mes no válido.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cerrar_mes", { p_mes: parsed.data });
  if (error) return fail(errorMessage(error, "No se pudo cerrar el mes. Inténtalo de nuevo."));

  revalidateClose();
  return ok();
}

export async function reopenMonth(month: unknown, input: unknown): Promise<ActionResult> {
  const parsedMonth = monthSchema.safeParse(month);
  const parsed = reopenMonthSchema.safeParse(input);
  if (!parsedMonth.success) return fail("Mes no válido.");
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Escribe el motivo.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reabrir_mes", { p_mes: parsedMonth.data, p_motivo: parsed.data.reason });
  if (error) return fail(errorMessage(error, "No se pudo reabrir el mes. Inténtalo de nuevo."));

  revalidateClose();
  return ok();
}

export async function changeCloseDay(day: unknown): Promise<ActionResult> {
  const parsed = closeDaySchema.safeParse(day);
  if (!parsed.success) return fail("El día de cierre va del 1 al 28.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cambiar_dia_cierre", { p_dia: parsed.data });
  if (error) return fail(errorMessage(error, "No se pudo cambiar el día. Inténtalo de nuevo."));

  revalidateClose();
  return ok();
}
