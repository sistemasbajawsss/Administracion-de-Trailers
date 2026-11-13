"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

import { shopEntrySchema, shopReleaseSchema } from "./schemas";

/** Los mensajes de las funciones de taller ya vienen en español y dicen qué corregir. */
function errorMessage(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  if (["23505", "23514", "P0002"].includes(error.code ?? "") && error.message) return error.message;
  return fallback;
}

/** Las pantallas que muestran si una unidad está en taller. */
function revalidateShop() {
  revalidatePath("/taller");
  revalidatePath("/unidades", "layout");
  revalidatePath("/");
  revalidatePath("/mantenimientos");
}

export async function registerShopEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = shopEntrySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos de la entrada.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_entrada_taller", {
    p_unidad_id: parsed.data.unitId,
    p_fecha: parsed.data.date,
    p_falla: parsed.data.fault,
  });
  if (error) return fail(errorMessage(error, "No se pudo registrar la entrada. Inténtalo de nuevo."));

  revalidateShop();
  return ok({ id: data });
}

export async function releaseFromShop(input: unknown): Promise<ActionResult> {
  const parsed = shopReleaseSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos de la salida.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.rpc("dar_salida_taller", {
    p_entrada_id: parsed.data.entryId,
    p_fecha: parsed.data.date,
    p_nota: parsed.data.note || undefined,
  });
  if (error) return fail(errorMessage(error, "No se pudo dar la salida. Inténtalo de nuevo."));

  revalidateShop();
  return ok();
}
