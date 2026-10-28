"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES } from "@/lib/auth/types";
import { getFixRate, type FixRate } from "@/lib/banxico";
import { createClient } from "@/lib/supabase/server";
import { removeReceiptFiles } from "@/lib/supabase/storage";
import { normalizeAmount, normalizeRate } from "@/lib/utils/format";

import { listExpenses } from "./queries";
import {
  exchangeRateDateSchema,
  purgeServiceSchema,
  restoreServiceSchema,
  deleteServiceSchema,
  serviceEditSchema,
  serviceFiltersSchema,
  serviceSchema,
  type ServiceInput,
} from "./schemas";
import type { ExpenseListItem } from "./types";

/** Los tipos generados marcan los argumentos de las funciones como no nulos, pero aceptan null. */
const nullable = <T,>(value: T | null) => value as T;
const emptyToNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** Del formulario a los argumentos de registrar_servicio / actualizar_servicio. */
function toArgs(service: ServiceInput) {
  return {
    p_unidad_id: service.unitId,
    p_fecha: service.date,
    p_kilometraje: nullable(service.mileage ? Number(service.mileage.replace(/,/g, "")) : null),
    p_proveedor_id: nullable(emptyToNull(service.supplierId)),
    p_descripcion: nullable(emptyToNull(service.description)),
    // En dólares no se manda el monto en pesos: lo calcula la BD con el tipo de cambio.
    p_gastos: service.expenses.map((expense) => ({
      id: emptyToNull(expense.id),
      categoria_id: expense.categoryId,
      concepto: emptyToNull(expense.concept),
      moneda: expense.currency,
      ...(expense.currency === "USD"
        ? { monto_usd: normalizeAmount(expense.amount), tipo_cambio: normalizeRate(expense.exchangeRate) }
        : { monto: normalizeAmount(expense.amount) }),
    })),
  };
}

/**
 * Tipo de cambio FIX de Banxico sugerido para la fecha del servicio. Si no hay
 * dato, el formulario pide escribirlo a mano.
 */
export async function suggestExchangeRate(date: unknown): Promise<ActionResult<FixRate | null>> {
  const parsed = exchangeRateDateSchema.safeParse(date);
  if (!parsed.success) return fail("Fecha no válida.");

  await requireRole(CAPTURE_ROLES);

  return ok(await getFixRate(parsed.data));
}

/**
 * Los triggers y funciones de la BD lanzan mensajes en español pensados para
 * el usuario (23514 / P0002). Los checks de columnas traen mensajes técnicos.
 */
function errorMessage(error: { code?: string; message?: string }, fallback: string) {
  const message = error.message ?? "";
  if ((error.code === "23514" || error.code === "P0002") && !message.includes("violates")) {
    return message;
  }
  if (error.code === "23514") return "Revisa los datos: hay un campo que no cumple las reglas.";
  if (error.code === "23503") return "La unidad, categoría o proveedor elegido ya no existe.";
  if (error.code === "42501") return "No tienes permiso para hacer este cambio.";
  return fallback;
}

function revalidateServices(unitIds: string[]) {
  revalidatePath("/servicios", "layout");
  revalidatePath("/");
  for (const unitId of unitIds) revalidatePath(`/unidades/${unitId}`);
}

export async function createService(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return fail("Revisa los datos del servicio.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_servicio", toArgs(parsed.data));
  if (error) return fail(errorMessage(error, "No se pudo guardar el servicio. Inténtalo de nuevo."));

  revalidateServices([parsed.data.unitId]);
  return ok({ id: data });
}

export async function updateService(
  id: string,
  previousUnitId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = serviceEditSchema.safeParse(input);
  if (!parsed.success) return fail("Revisa los datos del servicio.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_servicio", {
    p_servicio_id: id,
    ...toArgs(parsed.data),
    p_motivo: parsed.data.reason,
  });
  if (error) return fail(errorMessage(error, "No se pudieron guardar los cambios. Inténtalo de nuevo."));

  revalidateServices([previousUnitId, parsed.data.unitId]);
  return ok();
}

export async function deleteService(id: string, unitId: string, input: unknown): Promise<ActionResult> {
  const parsed = deleteServiceSchema.safeParse(input);
  if (!parsed.success) return fail("Explica por qué se elimina el servicio.");

  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("eliminar_servicio", {
    p_servicio_id: id,
    p_motivo: parsed.data.reason,
  });
  if (error) return fail(errorMessage(error, "No se pudo eliminar el servicio. Inténtalo de nuevo."));

  revalidateServices([unitId]);
  return ok();
}

/**
 * Borra para siempre la copia y la línea de cambios de un servicio ya eliminado
 * (solo admin), y los archivos de sus comprobantes. Queda una nota en la bitácora
 * de eliminaciones.
 */
export async function purgeService(historyId: number, input: unknown): Promise<ActionResult> {
  const parsed = purgeServiceSchema.safeParse(input);
  if (!parsed.success || !Number.isInteger(historyId)) return fail("Escribe ELIMINAR REGISTRO para confirmar.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data: receiptPaths, error } = await supabase.rpc("eliminar_servicio_definitivo", {
    p_historial_id: historyId,
    p_confirmacion: parsed.data.confirmation,
  });
  if (error) return fail(errorMessage(error, "No se pudo eliminar el servicio. Inténtalo de nuevo."));

  await removeReceiptFiles(supabase, receiptPaths);
  revalidatePath("/servicios/eliminados");
  return ok();
}

/** Restaura un servicio eliminado tal como estaba (solo admin, con motivo). */
export async function restoreService(historyId: number, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = restoreServiceSchema.safeParse(input);
  if (!parsed.success || !Number.isInteger(historyId)) return fail("Explica por qué se restaura el servicio.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restaurar_servicio", {
    p_historial_id: historyId,
    p_motivo: parsed.data.reason,
  });
  if (error) return fail(errorMessage(error, "No se pudo restaurar el servicio. Inténtalo de nuevo."));

  revalidatePath("/servicios", "layout");
  revalidatePath("/unidades", "layout");
  revalidatePath("/");
  return ok({ id: data });
}

const moreExpensesSchema = z.object({
  filters: serviceFiltersSchema.pick({ q: true, buscar: true, desde: true, hasta: true }),
  unitId: z.uuid().optional(),
  offset: z.number().int().min(0).max(100_000),
});

/**
 * Siguiente tanda del scroll infinito de gastos. Es una lectura: llama a
 * queries.ts con la sesión del usuario (RLS aplica), ver docs/ARQUITECTURA.md.
 */
export async function loadMoreExpenses(input: unknown): Promise<ActionResult<ExpenseListItem[]>> {
  const parsed = moreExpensesSchema.safeParse(input);
  if (!parsed.success) return fail("No se pudieron cargar más gastos.");

  const user = await requireRole(["admin", "capturista", "gerente"]);
  // La ficha de la unidad es solo para admin y gerente (la página también lo revisa).
  if (parsed.data.unitId && user.role === "capturista") return fail("No tienes acceso a esta unidad.");

  try {
    return ok(await listExpenses({ ...parsed.data.filters, unitId: parsed.data.unitId }, parsed.data.offset));
  } catch {
    return fail("No se pudieron cargar más gastos. Inténtalo de nuevo.");
  }
}
