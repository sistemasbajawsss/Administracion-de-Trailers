import { formatDate, formatKm } from "@/lib/utils/format";

/** Estado de un mantenimiento programado (mantenimientos_pendientes en la BD). */
export type MaintenanceStatus = "vencido" | "por_vencer" | "al_corriente" | "sin_kilometraje";

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
  /** La última vez que se hizo: desde ahí cuenta. */
  lastDate: string;
  lastKm: number | null;
  currentKm: number | null;
  nextKm: number | null;
  nextDate: string | null;
  kmLeft: number | null;
  daysLeft: number | null;
  status: MaintenanceStatus;
};

/** Unidad de la que se pueden copiar mantenimientos. */
export type MaintenanceSource = { unitId: string; economicNumber: string; count: number };

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
