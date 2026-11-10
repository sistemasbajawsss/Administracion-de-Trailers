import type { UnitOperation } from "@/features/unidades/types";
import { formatDate, formatKm } from "@/lib/utils/format";

/** Estado de un mantenimiento programado (mantenimientos_pendientes en la BD). */
export const MAINTENANCE_STATUSES = ["vencido", "por_vencer", "al_corriente", "sin_kilometraje"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  vencido: "Vencido",
  por_vencer: "Por vencer",
  al_corriente: "Al corriente",
  sin_kilometraje: "Sin kilometraje",
};

/** Orden en pantalla: lo urgente primero. */
export const MAINTENANCE_STATUS_ORDER: Record<MaintenanceStatus, number> = {
  vencido: 0,
  por_vencer: 1,
  sin_kilometraje: 2,
  al_corriente: 3,
};

/** Un mantenimiento programado de una unidad, con lo que le falta. */
export type Maintenance = {
  id: string;
  unitId: string;
  name: string;
  everyKm: number | null;
  everyMonths: number | null;
  /**
   * La última vez que se hizo: el correctivo más reciente que lo cumplió (Etapa 4)
   * o, si no hay, la fecha y km capturados en el mantenimiento. Desde ahí cuenta.
   */
  lastDate: string;
  lastKm: number | null;
  /** El correctivo que lo cumplió la última vez (null si cuenta desde lo capturado). */
  lastServiceId: string | null;
  currentKm: number | null;
  nextKm: number | null;
  nextDate: string | null;
  kmLeft: number | null;
  daysLeft: number | null;
  status: MaintenanceStatus;
};

/** Un mantenimiento en la página Mantenimientos (todas las unidades). */
export type FleetMaintenance = Maintenance & {
  economicNumber: string;
  unitTypeName: string;
};

/** Pestañas de la página Mantenimientos (con los nombres del usuario). */
export const MAINTENANCE_VIEWS = ["correctivos", "preventivos"] as const;
export type MaintenanceView = (typeof MAINTENANCE_VIEWS)[number];

/** Otra unidad a la que se puede aplicar un mantenimiento nuevo (las de baja o vendidas no salen). */
export type MaintenanceTarget = {
  id: string;
  economicNumber: string;
  typeName: string;
  operation: UnitOperation | null;
  /** Su tipo lleva kilometraje (las cajas, dollys y góndolas no). */
  hasOdometer: boolean;
  /** Sin kilometraje (o tipo sin odómetro): solo le pasa la parte por meses. */
  hasKm: boolean;
};

/** Lo que pasó en cada unidad al agregar un mantenimiento (agregar_mantenimiento en la BD). */
export const APPLY_RESULTS = ["agregado", "solo_meses", "ya_tiene", "sin_kilometraje", "caja_solo_km", "retirada"] as const;
export type ApplyResult = (typeof APPLY_RESULTS)[number];
export type ApplyOutcome = { unitId: string; economicNumber: string; result: ApplyResult };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const months = (n: number) => plural(n, "mes", "meses");

/** "Cada 15,000 km o 6 meses, lo que pase primero". */
export function describeInterval(m: Pick<Maintenance, "everyKm" | "everyMonths">) {
  if (m.everyKm && m.everyMonths) return `Cada ${formatKm(m.everyKm)} o ${months(m.everyMonths)}, lo que pase primero`;
  if (m.everyKm) return `Cada ${formatKm(m.everyKm)}`;
  return `Cada ${months(m.everyMonths ?? 0)}`;
}

/** "Toca a los 105,000 km o el 10/03/2027". */
export function describeNext(m: Pick<Maintenance, "nextKm" | "nextDate">) {
  const parts = [m.nextKm !== null ? `a los ${formatKm(m.nextKm)}` : null, m.nextDate ? `el ${formatDate(m.nextDate)}` : null];
  const text = parts.filter(Boolean).join(" o ");
  return text ? `Toca ${text}` : "";
}

/** "Faltan 5,000 km y 121 días" / "Se pasó por 2,000 km" / "Venció hace 28 días". */
export function describeLeft(m: Pick<Maintenance, "kmLeft" | "daysLeft" | "status">) {
  if (m.status === "sin_kilometraje") return "La unidad aún no tiene kilometraje registrado";
  const parts: string[] = [];
  if (m.kmLeft !== null) {
    parts.push(m.kmLeft <= 0 ? `se pasó por ${formatKm(-m.kmLeft)}` : `faltan ${formatKm(m.kmLeft)}`);
  }
  if (m.daysLeft !== null) {
    if (m.daysLeft < 0) parts.push(`venció hace ${plural(-m.daysLeft, "día", "días")}`);
    else if (m.daysLeft === 0) parts.push("vence hoy");
    else parts.push(`faltan ${plural(m.daysLeft, "día", "días")}`);
  }
  const text = parts.join(" y ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Registrar": el formulario de servicio con la unidad, el tipo (correctivo) y
 * este mantenimiento ya marcados. Una sola captura (D14).
 */
export const registerMaintenanceHref = (m: Pick<Maintenance, "unitId" | "id">) =>
  `/servicios/nuevo?unidad=${m.unitId}&tipo=correctivo&mantenimiento=${m.id}`;
