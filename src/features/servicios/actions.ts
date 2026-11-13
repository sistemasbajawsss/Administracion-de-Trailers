"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { isUuid } from "@/lib/utils/ids";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES } from "@/lib/auth/types";
import { getFixRate, type FixRate } from "@/lib/banxico";
import { createClient } from "@/lib/supabase/server";
import { removeReceiptFiles } from "@/lib/supabase/storage";
import { normalizeAmount, normalizeRate, todayInTijuana } from "@/lib/utils/format";
import { mileageIssue } from "@/lib/utils/mileage";

import {
  getOpenShopStay,
  getServiceShopLink,
  getUnitMileageRule,
  listExpenses,
  listServicesOfType,
  listServicesWithoutReceipts,
  listServicesWithoutShopEntry,
} from "./queries";
import {
  exchangeRateDateSchema,
  fallsInStay,
  placeIssues,
  shopIssues,
  purgeServiceSchema,
  restoreServiceSchema,
  deleteServiceSchema,
  serviceEditSchema,
  serviceFiltersSchema,
  serviceSchema,
  type ServiceInput,
} from "./schemas";
import { placeNeedsWorkshop, SERVICE_TYPES, type ExpenseListItem, type ServiceBrief, type ShopStay } from "./types";

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
    // Vacío (servicio de antes sin clasificar): la BD conserva el que tenía.
    p_tipo: service.serviceType || undefined,
    // ¿Dónde se hizo? (5G). Vacío (uno de antes): la BD conserva lo que tenía.
    p_lugar: service.place || undefined,
    p_taller_id: placeNeedsWorkshop(service.place) && service.workshopId ? service.workshopId : undefined,
    // Solo un correctivo cumple mantenimientos; sin tipo (uno de antes), la BD conserva lo que tenía.
    p_mantenimientos:
      service.serviceType === "correctivo" ? service.maintenanceIds : service.serviceType ? [] : undefined,
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
  revalidatePath("/taller");
  revalidatePath("/unidades", "layout");
  revalidatePath("/");
  revalidatePath("/mantenimientos");
  for (const unitId of unitIds) revalidatePath(`/unidades/${unitId}`);
}

export async function createService(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return fail("Revisa los datos del servicio.");

  await requireRole(CAPTURE_ROLES);

  // Taller (5E, D13) y kilometraje (5F, D14): mismas reglas que el formulario, con lo que hay hoy en la BD.
  let stay: ShopStay | null;
  let mileageRule: Awaited<ReturnType<typeof getUnitMileageRule>>;
  try {
    [stay, mileageRule] = await Promise.all([getOpenShopStay(parsed.data.unitId), getUnitMileageRule(parsed.data.unitId)]);
  } catch {
    return fail("No se pudo guardar el servicio. Inténtalo de nuevo.");
  }
  if (!mileageRule) return fail("La unidad ya no existe.");
  const values = parsed.data;
  const kmProblem = mileageIssue(values.mileage, {
    required: mileageRule.hasOdometer,
    last: mileageRule.last,
    date: values.date,
  });
  if (mileageRule.hasOdometer && kmProblem) return fail(kmProblem);
  if (!values.serviceType) return fail("Elige el tipo de servicio.");
  const placeProblem = placeIssues(values, { required: true })[0];
  if (placeProblem) return fail(`${placeProblem.message}.`);
  const linked = fallsInStay(stay, values.date);
  const issues = shopIssues(values, { stay, linked, needsReason: true, allowForgot: true });
  if (issues.length) return fail(issues[0]!.message);
  const forgot = !linked && values.forgotEntry;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_servicio", {
    ...toArgs(values),
    p_salida_taller: (linked || forgot) && values.leavesShop,
    p_motivo_sin_entrada: !linked && !forgot ? values.noEntryReason : undefined,
    p_entrada_fecha: forgot ? values.forgotEntryDate : undefined,
    p_entrada_falla: forgot ? values.forgotEntryFault : undefined,
  });
  if (error) return fail(errorMessage(error, "No se pudo guardar el servicio. Inténtalo de nuevo."));

  revalidateServices([values.unitId]);
  return ok({ id: data });
}

export async function updateService(
  id: string,
  previousUnitId: string,
  input: unknown,
): Promise<ActionResult> {
  if (!isUuid(id) || !isUuid(previousUnitId)) return fail("Servicio no válido.");
  const parsed = serviceEditSchema.safeParse(input);
  if (!parsed.success) return fail("Revisa los datos del servicio.");

  await requireRole(CAPTURE_ROLES);

  // Taller (5E): ¿el servicio queda ligado a una estancia después del cambio?
  // Misma regla que preparar_servicio en la BD.
  const values = parsed.data;
  let current: Awaited<ReturnType<typeof getServiceShopLink>>;
  let stay: ShopStay | null;
  try {
    [current, stay] = await Promise.all([getServiceShopLink(id), getOpenShopStay(values.unitId)]);
  } catch {
    return fail("No se pudieron guardar los cambios. Inténtalo de nuevo.");
  }
  if (!current) return fail("No se encontró el servicio.");
  const legacy = current.noEntry === null; // De antes de la 5E: no se liga ni se marca.
  const unitChanged = values.unitId !== current.unitId;
  const keepsLink =
    !unitChanged && current.entryId !== null && !(stay?.entryId === current.entryId && values.date < stay.entryDate);
  const linksToStay =
    fallsInStay(stay, values.date) && (unitChanged || (current.entryId === null && values.date !== current.date));
  const linked = legacy || keepsLink || linksToStay;
  const issues = shopIssues(values, { stay, linked, needsReason: !current.noEntryReason, allowForgot: false });
  if (issues.length) return fail(issues[0]!.message);
  const placeProblem = placeIssues(values, { required: false })[0];
  if (placeProblem) return fail(`${placeProblem.message}.`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_servicio", {
    p_servicio_id: id,
    ...toArgs(values),
    p_motivo: values.reason,
    p_salida_taller: !legacy && linked && values.leavesShop,
    p_motivo_sin_entrada: !linked ? values.noEntryReason || undefined : undefined,
  });
  if (error) return fail(errorMessage(error, "No se pudieron guardar los cambios. Inténtalo de nuevo."));

  revalidateServices([previousUnitId, parsed.data.unitId]);
  return ok();
}

export async function deleteService(id: string, unitId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(id) || !isUuid(unitId)) return fail("Servicio no válido.");
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

/** Días hacia atrás del aviso "Sin entrada a taller" de Inicio. */
const NO_ENTRY_DAYS_BACK = 30;
/** Renglones por tanda en "Ver todos" de las tarjetas de Inicio. */
const HOME_LIST_BATCH = 20;

const homeListSchema = z.object({
  list: z.enum(["sin_factura", "sin_entrada"]),
  offset: z.number().int().min(0).max(100_000),
});

/**
 * Siguiente tanda de "Ver todos" de Inicio: servicios sin factura (RLS: el
 * capturista, los suyos) o sin entrada a taller de los últimos 30 días (admin).
 */
export async function loadHomeList(input: unknown): Promise<ActionResult<ServiceBrief[]>> {
  const parsed = homeListSchema.safeParse(input);
  if (!parsed.success) return fail("No se pudieron cargar más servicios.");
  const { list, offset } = parsed.data;

  await requireRole(list === "sin_entrada" ? "admin" : ["admin", "capturista", "gerente"]);

  try {
    if (list === "sin_factura") return ok((await listServicesWithoutReceipts(HOME_LIST_BATCH, offset)).services);
    const [y, m, d] = todayInTijuana().split("-").map(Number) as [number, number, number];
    const since = new Date(Date.UTC(y, m - 1, d - NO_ENTRY_DAYS_BACK)).toISOString().slice(0, 10);
    return ok((await listServicesWithoutShopEntry(since, HOME_LIST_BATCH, offset)).services);
  } catch {
    return fail("No se pudieron cargar más servicios. Inténtalo de nuevo.");
  }
}

const moreServicesOfTypeSchema = z.object({
  type: z.enum(SERVICE_TYPES),
  offset: z.number().int().min(0).max(100_000),
});

/** Siguiente tanda del historial por tipo (pestaña Preventivos de Mantenimientos). RLS decide el alcance. */
export async function loadMoreServicesOfType(input: unknown): Promise<ActionResult<ServiceBrief[]>> {
  const parsed = moreServicesOfTypeSchema.safeParse(input);
  if (!parsed.success) return fail("No se pudieron cargar más servicios.");

  await requireRole(["admin", "capturista", "gerente"]);

  try {
    return ok((await listServicesOfType(parsed.data.type, parsed.data.offset)).services);
  } catch {
    return fail("No se pudieron cargar más servicios. Inténtalo de nuevo.");
  }
}

/** Un servicio de la misma unidad, el mismo día o en la misma estancia (aviso de posible duplicado, 5H). */
export type SimilarService = {
  id: string;
  date: string;
  description: string | null;
  categories: string | null;
  total: string;
  author: string | null;
  createdAt: string;
  sameStay: boolean;
};

/**
 * Antes de guardar un servicio nuevo: ¿ya hay servicios de esta unidad ese día o
 * en la misma estancia en taller? (pedido del usuario, 2026-11-12). No bloquea:
 * la pantalla pregunta si es otro gasto. Si la revisión falla, se guarda sin aviso.
 */
export async function findSimilarServices(unitId: unknown, date: unknown): Promise<ActionResult<SimilarService[]>> {
  if (!isUuid(unitId) || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ok([]);
  await requireRole(CAPTURE_ROLES);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("servicios_parecidos", { p_unidad_id: unitId, p_fecha: date });
  if (error) return ok([]);
  return ok(
    data.map((s) => ({
      id: s.id,
      date: s.fecha,
      description: s.descripcion,
      categories: s.categorias,
      total: String(s.total),
      author: s.autor_nombre,
      createdAt: s.created_at,
      sameStay: s.misma_estancia,
    })),
  );
}
