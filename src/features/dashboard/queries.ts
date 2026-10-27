import "server-only";

import type { UnitType } from "@/features/unidades/types";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import type { Group, ReportFilters, ResolvedPeriod } from "./schemas";
import type { ExportRow, Report } from "./types";

type Row = Record<string, Json | undefined>;
const rows = (value: Json | undefined): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const text = (value: Json | undefined) => (value === null || value === undefined ? "" : String(value));
const num = (value: Json | undefined) => Number(value ?? 0);
const orNull = (value: Json | undefined) => (value === null || value === undefined ? null : String(value));

/**
 * Todos los agrupados de Reportes en una consulta (reporte_gastos). Las sumas
 * se hacen en Postgres; aquí solo se renombran campos. Solo admin y gerente.
 */
export async function getReport(
  period: Pick<ResolvedPeriod, "from" | "to">,
  filters: Pick<ReportFilters, "grupo" | "tipo">,
  rankingSize = 10,
): Promise<Report> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reporte_gastos", {
    p_desde: period.from,
    p_hasta: period.to,
    p_grupo: (filters.grupo ?? null) as string,
    p_tipo: (filters.tipo ?? null) as UnitType,
    p_limite_ranking: rankingSize,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("No se pudo calcular el reporte");
  }

  const r = data as Row;
  return {
    total: text(r.total),
    previousTotal: text(r.total_anterior),
    services: num(r.servicios),
    expenses: num(r.gastos),
    units: num(r.unidades),
    byMonth: rows(r.por_mes).map((m) => ({ month: text(m.mes), total: text(m.total), services: num(m.servicios) })),
    byCategory: rows(r.por_categoria).map((c) => ({
      id: orNull(c.id),
      name: text(c.nombre),
      total: text(c.total),
      expenses: num(c.gastos),
    })),
    byUnit: rows(r.por_unidad).map((u) => ({
      id: text(u.id),
      economicNumber: text(u.numero),
      type: text(u.tipo) as UnitType,
      group: text(u.grupo) as Group,
      total: text(u.total),
      services: num(u.servicios),
    })),
    byGroup: rows(r.por_grupo).map((g) => ({ group: text(g.grupo) as Group, total: text(g.total) })),
    byType: rows(r.por_tipo).map((t) => ({ type: text(t.tipo) as UnitType, total: text(t.total) })),
    bySupplier: rows(r.por_proveedor).map((p) => ({
      id: orNull(p.id),
      name: text(p.nombre),
      total: text(p.total),
      services: num(p.servicios),
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
    p_tipo: (filters.tipo ?? null) as UnitType,
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
  }));
}
