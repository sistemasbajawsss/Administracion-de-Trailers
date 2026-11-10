import "server-only";

import type { ServicePlace, ServiceType } from "@/features/servicios/types";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import type { Group, ReportFilters, ResolvedPeriod } from "./schemas";
import type { ExportRow, Report } from "./types";

type Row = Record<string, Json | undefined>;
const rows = (value: Json | undefined): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const text = (value: Json | undefined) => (value === null || value === undefined ? "" : String(value));
const num = (value: Json | undefined) => Number(value ?? 0);
const orNull = (value: Json | undefined) => (value === null || value === undefined ? null : String(value));

/** Tipos de unidad para el filtro y las etiquetas (nombre del catálogo), en su orden. */
export async function listReportUnitTypes(): Promise<{ key: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tipos_unidad").select("clave, nombre").order("orden");
  if (error) throw new Error("No se pudieron cargar los tipos de unidad");
  return data.map((t) => ({ key: t.clave, name: t.nombre }));
}

/**
 * Todos los agrupados de Reportes en una consulta (reporte_gastos). Las sumas
 * se hacen en Postgres; aquí solo se renombran campos. Solo admin y gerente.
 */
export async function getReport(
  period: Pick<ResolvedPeriod, "from" | "to" | "previous">,
  filters: Pick<ReportFilters, "grupo" | "tipo">,
  rankingSize = 10,
): Promise<Report> {
  const supabase = await createClient();
  const [{ data, error }, typeNames] = await Promise.all([
    supabase.rpc("reporte_gastos", {
    p_desde: period.from,
    p_hasta: period.to,
    p_grupo: (filters.grupo ?? null) as string,
    p_tipo: (filters.tipo ?? null) as string,
    p_limite_ranking: rankingSize,
    // Sin periodo anterior (rango libre), la BD usa los días previos del mismo largo.
    ...(period.previous ? { p_anterior_desde: period.previous.from, p_anterior_hasta: period.previous.to } : {}),
    }),
    listReportUnitTypes().then((types) => Object.fromEntries(types.map((t) => [t.key, t.name]))),
  ]);
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("No se pudo calcular el reporte");
  }

  const r = data as Row;
  const usd = (r.dolares && typeof r.dolares === "object" && !Array.isArray(r.dolares) ? r.dolares : {}) as Row;
  return {
    typeNames,
    total: text(r.total),
    previousTotal: text(r.total_anterior),
    previousFrom: text(r.anterior_desde),
    previousTo: text(r.anterior_hasta),
    services: num(r.servicios),
    expenses: num(r.gastos),
    units: num(r.unidades),
    usd: { amount: text(usd.usd) || "0", mxn: text(usd.mxn) || "0", expenses: num(usd.gastos) },
    byMonth: rows(r.por_mes).map((m) => ({
      month: text(m.mes),
      total: text(m.total),
      services: num(m.servicios),
      kinds: {
        correctivo: text(m.correctivo) || "0",
        preventivo: text(m.preventivo) || "0",
        servicio: text(m.servicio) || "0",
        sin_tipo: text(m.sin_tipo) || "0",
      },
    })),
    byCategory: rows(r.por_categoria).map((c) => ({
      id: orNull(c.id),
      name: text(c.nombre),
      total: text(c.total),
      expenses: num(c.gastos),
    })),
    byUnit: rows(r.por_unidad).map((u) => ({
      id: text(u.id),
      economicNumber: text(u.numero),
      type: text(u.tipo) as string,
      group: text(u.grupo) as Group,
      total: text(u.total),
      services: num(u.servicios),
    })),
    byGroup: rows(r.por_grupo).map((g) => ({ group: text(g.grupo) as Group, total: text(g.total) })),
    byType: rows(r.por_tipo).map((t) => ({ type: text(t.tipo) as string, total: text(t.total) })),
    byServiceType: rows(r.por_tipo_servicio).map((t) => ({
      type: orNull(t.tipo) as ServiceType | null,
      total: text(t.total),
      services: num(t.servicios),
    })),
    bySupplier: rows(r.por_proveedor).map((p) => ({
      id: orNull(p.id),
      name: text(p.nombre),
      total: text(p.total),
      services: num(p.servicios),
    })),
    byPlace: rows(r.por_lugar).map((p) => ({
      place: orNull(p.lugar) as ServicePlace | null,
      total: text(p.total),
      services: num(p.servicios),
    })),
    byWorkshop: rows(r.por_taller).map((t) => ({
      id: text(t.id),
      name: text(t.nombre),
      total: text(t.total),
      services: num(t.servicios),
      onTheRoad: num(t.en_camino),
    })),
  };
}

/** Detalle de gastos para el Excel (mismos filtros; máximo 50,000 renglones). */
export async function listExportRows(
  period: Pick<ResolvedPeriod, "from" | "to">,
  filters: Pick<ReportFilters, "grupo" | "tipo">,
): Promise<ExportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exportar_gastos", {
    p_desde: period.from,
    p_hasta: period.to,
    p_grupo: (filters.grupo ?? null) as string,
    p_tipo: (filters.tipo ?? null) as string,
  });
  if (error) throw new Error("No se pudo preparar el Excel");

  return data.map((row) => ({
    date: row.fecha,
    economicNumber: row.numero_economico,
    type: row.tipo,
    group: row.grupo as Group,
    category: row.categoria,
    concept: row.concepto,
    supplier: row.proveedor,
    description: row.descripcion,
    amount: row.monto,
    currency: row.moneda,
    usdAmount: row.monto_usd,
    exchangeRate: row.tipo_cambio,
    serviceType: row.tipo_servicio,
    place: row.lugar,
    workshop: row.taller,
  }));
}
