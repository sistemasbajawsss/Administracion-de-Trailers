import "server-only";

import { createClient } from "@/lib/supabase/server";
import { toLastMileage } from "@/lib/utils/mileage";

import type { UnitFilters } from "./schemas";
import type {
  UnitDetail,
  UnitGroup,
  UnitInShop,
  UnitListItem,
  UnitMileage,
  UnitSale,
  UnitShopStay,
} from "./types";

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

/**
 * Unidades en taller ahora mismo (Inicio del admin y el gerente), de sus entradas
 * abiertas (5E): la que lleva más días primero, con su falla.
 */
export async function listUnitsInShop(): Promise<UnitInShop[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entradas_taller")
    .select("fecha_entrada, falla, unidad:unidades!inner(id, numero_economico, tipo, operacion)")
    .is("fecha_salida", null)
    .order("fecha_entrada", { ascending: true });

  if (error) throw new Error("No se pudieron cargar las unidades en taller");
  return data.map((row) => ({
    id: row.unidad.id,
    economicNumber: row.unidad.numero_economico,
    type: row.unidad.tipo,
    operation: row.unidad.operacion,
    entryDate: row.fecha_entrada,
    fault: row.falla,
  }));
}

/** Estancias por tanda en la ficha (scroll infinito con el scroll de la página). */
export const SHOP_STAYS_BATCH_SIZE = 10;

/**
 * Estancias en taller de una unidad (ficha; admin y gerente), la más reciente
 * primero, por tandas, con su total (sumado en la BD) y sus servicios.
 */
export async function listUnitShopStays(
  unitId: string,
  offset = 0,
  limit = SHOP_STAYS_BATCH_SIZE,
): Promise<{ stays: UnitShopStay[]; total: number }> {
  const supabase = await createClient();
  const stays = await supabase
      .from("entradas_taller_resumen")
      .select("id, fecha_entrada, fecha_salida, falla, nota_salida, reporta_nombre, servicio_salida_id, num_servicios, total::text", {
        count: "exact",
      })
      .eq("unidad_id", unitId)
      .order("fecha_entrada", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + limit - 1)
      .returns<
        {
          id: string;
          fecha_entrada: string;
          fecha_salida: string | null;
          falla: string;
          nota_salida: string | null;
          reporta_nombre: string | null;
          servicio_salida_id: string | null;
          num_servicios: number;
          total: string;
        }[]
      >();
  if (stays.error) throw new Error("No se pudieron cargar las estancias en taller");

  // Los servicios solo de las estancias de esta tanda.
  const ids = stays.data.map((row) => row.id);
  const services = ids.length
    ? await supabase
        .from("servicios_resumen")
        .select("id, fecha, total::text, descripcion, entrada_taller_id, proveedor:proveedores(nombre)")
        .in("entrada_taller_id", ids)
        .order("fecha")
        .order("created_at")
        .returns<
          {
            id: string;
            fecha: string;
            total: string;
            descripcion: string | null;
            entrada_taller_id: string;
            proveedor: { nombre: string } | null;
          }[]
        >()
    : { data: [], error: null };
  if (services.error) throw new Error("No se pudieron cargar los servicios de las estancias");
  return {
    stays: stays.data.map((row) => ({
      id: row.id,
      entryDate: row.fecha_entrada,
      exitDate: row.fecha_salida,
      fault: row.falla,
      exitNote: row.nota_salida,
      reportedBy: row.reporta_nombre,
      serviceCount: row.num_servicios,
      total: row.total,
      exitServiceId: row.servicio_salida_id,
      services: services.data
        .filter((s) => s.entrada_taller_id === row.id)
        .map((s) => ({ id: s.id, date: s.fecha, total: s.total, description: s.descripcion, supplier: s.proveedor?.nombre ?? null })),
    })),
    total: stays.count ?? 0,
  };
}

/** Venta vigente de la unidad (solo admin y gerente la ven; RLS). null si no está vendida. */
export async function getUnitSale(unitId: string): Promise<UnitSale | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ventas_unidades")
    .select("fecha_venta, nota, vendida_nombre")
    .eq("unidad_id", unitId)
    .is("deshecha_at", null)
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar la venta de la unidad");
  return data ? { date: data.fecha_venta, note: data.nota, soldBy: data.vendida_nombre } : null;
}
/** Correcciones que se muestran en la ficha (las más recientes). */
const MILEAGE_CORRECTIONS_LIMIT = 20;

/**
 * Kilometraje actual de la unidad (5F) y sus correcciones. RLS: el capturista no
 * ve correcciones (la ficha es de admin y gerente).
 */
export async function getUnitMileage(unitId: string): Promise<UnitMileage> {
  const supabase = await createClient();
  const [current, corrections] = await Promise.all([
    supabase.rpc("kilometraje_unidades", { p_unidad_id: unitId }),
    supabase
      .from("correcciones_kilometraje")
      .select("id, fecha, kilometraje, kilometraje_anterior, motivo, autor_nombre, created_at")
      .eq("unidad_id", unitId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(MILEAGE_CORRECTIONS_LIMIT),
  ]);
  if (current.error || corrections.error) throw new Error("No se pudo cargar el kilometraje de la unidad");

  const row = current.data[0];
  return {
    last: row ? toLastMileage(row) : null,
    corrections: corrections.data.map((c) => ({
      id: c.id,
      date: c.fecha,
      km: c.kilometraje,
      previousKm: c.kilometraje_anterior,
      reason: c.motivo,
      author: c.autor_nombre,
      createdAt: c.created_at,
    })),
  };
}
