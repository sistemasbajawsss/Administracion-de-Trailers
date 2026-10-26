import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { UnitFilters } from "./schemas";
import type { UnitDetail, UnitGroup, UnitListItem } from "./types";

export const UNITS_PAGE_SIZE = 25;

const LIST_COLUMNS =
  "id, numero_economico, tipo, operacion, estatus, longitud_pies, marca, modelo, placas, notas, chofer:choferes(nombre)";

type UnitRow = {
  id: string;
  numero_economico: string;
  tipo: UnitListItem["type"];
  operacion: UnitListItem["operation"];
  estatus: UnitListItem["status"];
  longitud_pies: number | null;
  marca: string | null;
  modelo: string | null;
  placas: string | null;
  notas: string | null;
  chofer: { nombre: string } | null;
};

function toListItem(row: UnitRow): UnitListItem {
  return {
    id: row.id,
    economicNumber: row.numero_economico,
    type: row.tipo,
    operation: row.operacion,
    status: row.estatus,
    driverName: row.chofer?.nombre ?? null,
    lengthFt: row.longitud_pies,
    make: row.marca,
    model: row.modelo,
    plates: row.placas,
    notes: row.notas,
  };
}

/**
 * Lista paginada de un grupo (Locales, Foráneos o Camionetas) con filtros.
 * Orden: tipo y luego número natural (numero_orden: T-2 antes que T-10).
 */
export async function listUnits(filters: UnitFilters) {
  const supabase = await createClient();
  const from = (filters.pagina - 1) * UNITS_PAGE_SIZE;

  let query = supabase
    .from("unidades")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("tipo")
    .order("numero_orden")
    .range(from, from + UNITS_PAGE_SIZE - 1);

  query =
    filters.grupo === "camionetas"
      ? query.eq("tipo", "camioneta")
      : query.eq("operacion", filters.grupo);

  if (filters.q) query = query.ilike("numero_economico", `%${filters.q}%`);
  if (filters.tipo) query = query.eq("tipo", filters.tipo);
  if (filters.estatus) query = query.eq("estatus", filters.estatus);
  if (filters.sinChofer) query = query.is("chofer_id", null);

  const { data, count, error } = await query.returns<UnitRow[]>();
  if (error) throw new Error("No se pudieron cargar las unidades");

  return { units: data.map(toListItem), total: count ?? 0 };
}

/** Número de unidades por grupo, para las pestañas. Tres conteos en paralelo. */
export async function countUnitsByGroup(): Promise<Record<UnitGroup, number>> {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };

  const [local, foraneo, camionetas] = await Promise.all([
    supabase.from("unidades").select("id", head).eq("operacion", "local"),
    supabase.from("unidades").select("id", head).eq("operacion", "foraneo"),
    supabase.from("unidades").select("id", head).eq("tipo", "camioneta"),
  ]);

  return {
    local: local.count ?? 0,
    foraneo: foraneo.count ?? 0,
    camionetas: camionetas.count ?? 0,
  };
}

export async function getUnit(id: string): Promise<UnitDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select(`${LIST_COLUMNS}, chofer_id, anio, vin`)
    .eq("id", id)
    .returns<(UnitRow & { chofer_id: string | null; anio: number | null; vin: string | null })[]>()
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar la unidad");
  if (!data) return null;

  return { ...toListItem(data), driverId: data.chofer_id, year: data.anio, vin: data.vin };
}

/** Unidades en taller ahora mismo (Inicio del admin y el gerente), en orden natural. */
export async function listUnitsInShop(): Promise<UnitListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select(LIST_COLUMNS)
    .eq("estatus", "en_taller")
    .order("tipo")
    .order("numero_orden")
    .returns<UnitRow[]>();

  if (error) throw new Error("No se pudieron cargar las unidades en taller");
  return data.map(toListItem);
}
