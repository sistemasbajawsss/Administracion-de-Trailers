import { z } from "zod";

import { UNIT_TYPES } from "@/features/unidades/types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const PERIODS = ["este-mes", "mes-pasado", "3m", "6m", "12m", "este-anio", "rango"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Exclude<Period, "rango">, string> = {
  "este-mes": "Este mes",
  "mes-pasado": "Mes pasado",
  "3m": "Últimos 3 meses",
  "6m": "Últimos 6 meses",
  "12m": "Últimos 12 meses",
  "este-anio": "Este año",
};

export const GROUPS = ["local", "foraneo", "camionetas"] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_LABELS: Record<Group, string> = {
  local: "Locales",
  foraneo: "Foráneos",
  camionetas: "Camionetas",
};

/** Filtros de Reportes y del Excel, en la URL. Lo inválido cae en el valor por defecto. */
export const reportFiltersSchema = z.object({
  periodo: z.enum(PERIODS).catch("12m"),
  desde: z.string().regex(DATE_PATTERN).optional().catch(undefined),
  hasta: z.string().regex(DATE_PATTERN).optional().catch(undefined),
  grupo: z.enum(GROUPS).optional().catch(undefined),
  tipo: z.enum(UNIT_TYPES).optional().catch(undefined),
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export type ResolvedPeriod = { from: string; to: string; label: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  // Date.UTC normaliza meses fuera de rango (m = 0 → diciembre del año anterior).
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/**
 * Convierte el periodo elegido en fechas, a partir de "hoy" en Tijuana.
 * "Últimos N meses" empieza el día 1 de hace N-1 meses: así la gráfica por mes
 * tiene N barras (la última es el mes en curso).
 */
export function resolvePeriod(filters: ReportFilters, today: string): ResolvedPeriod {
  const [y, m] = today.split("-").map(Number) as [number, number];
  switch (filters.periodo) {
    case "este-mes":
      return { from: iso(y, m, 1), to: today, label: PERIOD_LABELS["este-mes"] };
    case "mes-pasado":
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0), label: PERIOD_LABELS["mes-pasado"] };
    case "3m":
      return { from: iso(y, m - 2, 1), to: today, label: PERIOD_LABELS["3m"] };
    case "6m":
      return { from: iso(y, m - 5, 1), to: today, label: PERIOD_LABELS["6m"] };
    case "este-anio":
      return { from: iso(y, 1, 1), to: today, label: PERIOD_LABELS["este-anio"] };
    case "rango":
      if (filters.desde && filters.hasta && filters.desde <= filters.hasta) {
        return { from: filters.desde, to: filters.hasta, label: "Rango elegido" };
      }
      return { from: iso(y, m - 11, 1), to: today, label: PERIOD_LABELS["12m"] };
    default:
      return { from: iso(y, m - 11, 1), to: today, label: PERIOD_LABELS["12m"] };
  }
}

// Meses "2026-03" en español (tabla del servidor y gráfica).
const shortMonth = new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit", timeZone: "UTC" });
const longMonth = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const toDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

/** "2026-03" → "mar 26". */
export const monthLabel = (month: string) => shortMonth.format(toDate(month)).replace(".", "");
/** "2026-03" → "marzo de 2026". */
export const monthLongLabel = (month: string) => longMonth.format(toDate(month));
