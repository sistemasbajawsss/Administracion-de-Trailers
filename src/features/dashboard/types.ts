import type { ServicePlace, ServiceType } from "@/features/servicios/types";
import type { UnitType } from "@/features/unidades/types";

import type { Group } from "./schemas";

/**
 * Tipo de servicio en Reportes (5F): Mantenimiento (correctivo y preventivo)
 * contra Reparaciones (el tipo "Servicio"); los de antes de la 5F, sin tipo.
 * El orden es el de la pila de la gráfica, de abajo hacia arriba.
 */
export const SERVICE_KINDS = ["correctivo", "preventivo", "servicio", "sin_tipo"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  correctivo: "Correctivo",
  preventivo: "Preventivo",
  servicio: "Reparaciones",
  sin_tipo: "Sin tipo",
};

/**
 * Mantenimiento en dos azules (misma familia) y reparaciones en ámbar; sin tipo
 * en gris. Revisados para daltonismo (separación ΔE ≥ 21); el azul claro tiene
 * poco contraste con el blanco, por eso lleva leyenda con montos y tabla.
 */
export const SERVICE_KIND_COLORS: Record<ServiceKind, string> = {
  correctivo: "#0b5f99",
  preventivo: "#3fa3e0",
  servicio: "#c77a0a",
  sin_tipo: "#a3b1b5",
};

/**
 * ¿Dónde se hizo? en Reportes (5G): Taller Realso, taller de fuera, en camino y,
 * los de antes de la 5G, sin dato. Colores revisados con el validador de
 * paletas (daltonismo ΔE ≥ 14, contraste ≥ 3:1); sin dato en gris, siempre con
 * su nombre y su monto al lado.
 */
export const PLACE_KINDS = ["taller_propio", "taller_externo", "en_camino", "sin_dato"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  taller_propio: "Taller Realso",
  taller_externo: "Talleres de fuera",
  en_camino: "En camino",
  sin_dato: "Sin dato",
};

export const PLACE_KIND_COLORS: Record<PlaceKind, string> = {
  taller_propio: "#0a8f6a",
  taller_externo: "#7c4dbd",
  en_camino: "#c2410c",
  sin_dato: "#a3b1b5",
};

/** Montos como texto exacto de la BD ("12345.67"); se convierten a centavos para dibujar. */
export type Report = {
  /** Nombre de cada tipo de unidad (catálogo), por clave. */
  typeNames: Record<string, string>;
  total: string;
  previousTotal: string;
  /** Fechas contra las que se comparó (mes anterior, mismo tramo del año pasado…). */
  previousFrom: string;
  previousTo: string;
  services: number;
  expenses: number;
  units: number;
  /** Lo pagado en dólares en el periodo; su equivalente en pesos ya está en total. */
  usd: { amount: string; mxn: string; expenses: number };
  /** kinds: lo del mes partido por tipo de servicio (suman el total). */
  byMonth: { month: string; total: string; services: number; kinds: Record<ServiceKind, string> }[];
  byCategory: { id: string | null; name: string; total: string; expenses: number }[];
  byUnit: { id: string; economicNumber: string; type: UnitType; group: Group; total: string; services: number }[];
  byGroup: { group: Group; total: string }[];
  byType: { type: UnitType; total: string }[];
  /** Por tipo de servicio (5F); type null = servicios de antes, sin tipo. */
  byServiceType: { type: ServiceType | null; total: string; services: number }[];
  bySupplier: { id: string | null; name: string; total: string; services: number }[];
  /** ¿Dónde se hizo? (5G); place null = servicios de antes, sin dato. */
  byPlace: { place: ServicePlace | null; total: string; services: number }[];
  /** Talleres de fuera (también en camino), los que más se llevaron. */
  byWorkshop: { id: string; name: string; total: string; services: number; onTheRoad: number }[];
};

export type ExportRow = {
  date: string;
  economicNumber: string;
  type: UnitType;
  group: Group;
  category: string;
  concept: string | null;
  supplier: string;
  description: string | null;
  /** Monto en pesos. */
  amount: string;
  currency: "MXN" | "USD";
  /** Solo en gastos en dólares. */
  usdAmount: string | null;
  exchangeRate: string | null;
  serviceType: ServiceType | null;
  place: ServicePlace | null;
  workshop: string | null;
};

/** Total y servicios de cada lugar en el periodo (de byPlace; null = sin dato). */
export function placeKindTotals(byPlace: Report["byPlace"]): Record<PlaceKind, { total: string; services: number }> {
  const out = Object.fromEntries(PLACE_KINDS.map((k) => [k, { total: "0", services: 0 }])) as Record<
    PlaceKind,
    { total: string; services: number }
  >;
  for (const p of byPlace) out[p.place ?? "sin_dato"] = { total: p.total, services: p.services };
  return out;
}

/** Total y servicios de cada tipo en el periodo (de byServiceType; null = sin tipo). */
export function serviceKindTotals(byServiceType: Report["byServiceType"]): Record<ServiceKind, { total: string; services: number }> {
  const out = Object.fromEntries(SERVICE_KINDS.map((k) => [k, { total: "0", services: 0 }])) as Record<
    ServiceKind,
    { total: string; services: number }
  >;
  for (const t of byServiceType) out[t.type ?? "sin_tipo"] = { total: t.total, services: t.services };
  return out;
}
