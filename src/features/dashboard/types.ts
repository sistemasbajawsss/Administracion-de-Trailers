import type { ServiceType } from "@/features/servicios/types";
import type { UnitType } from "@/features/unidades/types";

import type { Group } from "./schemas";

/** Montos como texto exacto de la BD ("12345.67"); se convierten a centavos para dibujar. */
export type Report = {
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
  byMonth: { month: string; total: string; services: number }[];
  byCategory: { id: string | null; name: string; total: string; expenses: number }[];
  byUnit: { id: string; economicNumber: string; type: UnitType; group: Group; total: string; services: number }[];
  byGroup: { group: Group; total: string }[];
  byType: { type: UnitType; total: string }[];
  /** Por tipo de servicio (5F); type null = servicios de antes, sin tipo. */
  byServiceType: { type: ServiceType | null; total: string; services: number }[];
  bySupplier: { id: string | null; name: string; total: string; services: number }[];
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
};
