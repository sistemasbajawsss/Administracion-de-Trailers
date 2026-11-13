"use server";

import { revalidatePath } from "next/cache";

import { fail, failConflict, ok, versionSchema, type ActionResult } from "@/lib/action-result";
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
  makeUnitSchema,
  renameUnitTypeSchema,
  unitTypeSchema,
  type UnitInput,
} from "./schemas";
import { getUnitTypes, getUnitVersion, listUnitShopStays } from "./queries";
import { UNIT_TYPE_KEY, type UnitShopStay, type UnitTypeCatalog } from "./types";

const emptyToNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** Del formulario (camelCase, strings) a columnas de la BD. */
function toRow(unit: UnitInput, types: UnitTypeCatalog) {
  const type = types[unit.type];
  return {
    numero_economico: normalizeEconomicNumber(unit.economicNumber),
    tipo: unit.type,
    operacion: !type?.hasOperation || unit.operation === "" ? null : unit.operation,
    estatus: unit.status,
    chofer_id: emptyToNull(unit.driverId),
    longitud_pies: type?.hasLength && unit.lengthFt ? Number(unit.lengthFt) : null,
    placas: emptyToNull(unit.plates),
    marca: emptyToNull(unit.make),
    modelo: emptyToNull(unit.model),
    anio: unit.year ? Number(unit.year) : null,
    vin: emptyToNull(unit.vin),
    notas: emptyToNull(unit.notes),
    // Lo pone la BD según el tipo (validar_tipo_de_unidad).
    orden_tipo: 0,
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
  // Las reglas del tipo (letra, local/foráneo, largo) ya vienen explicadas en español.
  if (error.code === "23514" && error.message && !error.message.includes("violates")) return error.message;
  if (error.code === "23514") return "Revisa los datos: hay un campo que no cumple las reglas.";
  if (error.code === "23503") return "El chofer elegido ya no existe.";
  if (error.code === "42501") return "No tienes permiso para modificar unidades.";
  return "No se pudo guardar la unidad. Inténtalo de nuevo.";
}

export async function createUnit(input: unknown): Promise<ActionResult<{ id: string }>> {
  const types = await getUnitTypes();
  const parsed = makeUnitSchema(types).safeParse(input);
  if (!parsed.success) return fail("Revisa los datos de la unidad.");

  const user = await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .insert({ ...toRow(parsed.data, types), created_by: user.id })
    .select("id")
    .single();
  if (error) return fail(errorMessage(error));

  revalidatePath("/unidades", "layout");
  return ok({ id: data.id });
}

/**
 * `version`: `updated_at` de la unidad cuando se abrió el formulario (5I). Solo
 * se guarda si nadie la cambió después (otro admin, una entrada o salida de
 * taller, una venta); si no, se regresa `conflict` para explicarlo.
 */
export async function updateUnit(id: string, input: unknown, version: string): Promise<ActionResult> {
  if (!isUuid(id) || !versionSchema.safeParse(version).success) return fail("Unidad no válida.");
  const types = await getUnitTypes();
  const parsed = makeUnitSchema(types).safeParse(input);
  if (!parsed.success) return fail("Revisa los datos de la unidad.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .update(toRow(parsed.data, types))
    .eq("id", id)
    .eq("updated_at", version)
    .select("id");
  if (error) return fail(errorMessage(error));
  if (!data.length) {
    const current = await getUnitVersion(id).catch(() => null);
    if (current && current !== version) {
      return failConflict("Esta unidad cambió mientras la editabas.", { by: null, at: current });
    }
    return fail("La unidad no existe o no tienes permiso para editarla.");
  }

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

// ---------------------------------------------------------------------------
// Tipos de unidad (Catálogos, solo admin)
// ---------------------------------------------------------------------------

function unitTypeError(error: { code?: string; message?: string }) {
  if (error.code === "23505") {
    return error.message?.includes("prefijo")
      ? "Esa letra ya la usa otro tipo de unidad."
      : "Ya existe un tipo de unidad con ese nombre.";
  }
  if (error.code === "23514" && error.message && !error.message.includes("violates")) return error.message;
  if (error.code === "42501") return "Solo un administrador puede cambiar los tipos de unidad.";
  return "No se pudo guardar el tipo de unidad. Inténtalo de nuevo.";
}

/** Todo lo que muestra o pide tipos de unidad. */
function revalidateUnitTypes() {
  revalidatePath("/admin/catalogos");
  revalidatePath("/", "layout");
}

export async function createUnitType(input: unknown): Promise<ActionResult<{ name: string; prefix: string }>> {
  const parsed = unitTypeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos del tipo.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tipos_unidad")
    .insert({
      // La BD saca la clave del nombre y pone el orden.
      clave: "nuevo",
      orden: 0,
      nombre: parsed.data.name,
      prefijo: parsed.data.prefix.toUpperCase(),
      lleva_kilometraje: parsed.data.hasOdometer,
      lleva_largo: parsed.data.hasLength,
      lleva_operacion: parsed.data.hasOperation,
    })
    .select("nombre, prefijo")
    .single();
  if (error) return fail(unitTypeError(error));

  revalidateUnitTypes();
  return ok({ name: data.nombre, prefix: data.prefijo });
}

export async function renameUnitType(key: string, input: unknown): Promise<ActionResult> {
  if (!UNIT_TYPE_KEY.test(key)) return fail("Tipo de unidad no válido.");
  const parsed = renameUnitTypeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa el nombre.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tipos_unidad")
    .update({ nombre: parsed.data.name })
    .eq("clave", key)
    .select("clave");
  if (error) return fail(unitTypeError(error));
  if (!data.length) return fail("No se encontró el tipo de unidad.");

  revalidateUnitTypes();
  return ok();
}

/** Desactivado: ya no se ofrece al dar de alta unidades; las que hay no cambian. */
export async function setUnitTypeActive(key: string, active: boolean): Promise<ActionResult> {
  if (!UNIT_TYPE_KEY.test(key)) return fail("Tipo de unidad no válido.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase.from("tipos_unidad").update({ activo: active }).eq("clave", key).select("clave");
  if (error) return fail(unitTypeError(error));
  if (!data.length) return fail("No se encontró el tipo de unidad.");

  revalidateUnitTypes();
  return ok();
}
