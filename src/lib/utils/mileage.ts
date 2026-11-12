import { addDays, formatDate, formatKm } from "./format";

/** Última lectura del odómetro de una unidad (kilometraje_unidades en la BD). */
export type LastMileage = {
  km: number;
  /** aaaa-mm-dd */
  date: string;
  source: "servicio" | "entrada a taller" | "corrección" | "lectura semanal";
};

const MILEAGE_PATTERN = /^\d{1,7}$/;

/** "250,000" / "250000" → 250000; vacío o inválido → null. */
export function parseKm(value: string): number | null {
  const clean = value.trim().replace(/,/g, "");
  return MILEAGE_PATTERN.test(clean) ? Number(clean) : null;
}

/** El texto del campo es vacío o un número válido (el formato lo revisa el schema). */
export const isKmText = (value: string) => value.trim() === "" || parseKm(value) !== null;

/** "250,000 km el 04/11/2026 (servicio)". */
export function describeMileage(last: LastMileage) {
  return `${formatKm(last.km)} el ${formatDate(last.date)} (${last.source})`;
}

/**
 * Reglas del kilometraje (5F, D14), iguales en el navegador y en el servidor:
 * - obligatorio cuando `required` (alta de servicio o entrada a taller de una unidad que no es caja);
 * - aviso temprano si es menor a la última lectura y la fecha es posterior a ella
 *   (las del mismo día no se comparan, igual que en la BD). La BD hace la revisión
 *   completa por fecha (también con fechas atrasadas).
 * Regresa el mensaje del problema o null.
 */
export function mileageIssue(
  value: string,
  { required, last, date }: { required: boolean; last?: LastMileage | null; date?: string },
): string | null {
  if (value.trim() === "") return required ? "Escribe el kilometraje" : null;
  const km = parseKm(value);
  if (km === null) return "Kilometraje: solo números";
  if (last && date && date > last.date && km < last.km) {
    return `El kilometraje no cuadra: la unidad ya tenía ${describeMileage(last)}`;
  }
  return null;
}

/** Un renglón de kilometraje_unidades → LastMileage (null si la unidad no tiene lecturas). */
export function toLastMileage(row: { kilometraje: number | null; fecha: string | null; fuente: string | null }): LastMileage | null {
  if (row.kilometraje === null || row.fecha === null) return null;
  return { km: row.kilometraje, date: row.fecha, source: (row.fuente ?? "servicio") as LastMileage["source"] };
}

// ---------------------------------------------------------------------------
// Kilometraje semanal (5H, D15)
// ---------------------------------------------------------------------------

/** 1 = lunes … 7 = domingo, de una fecha "aaaa-mm-dd". */
function isoWeekday(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Lunes de la semana de esa fecha (igual que inicio_semana en la BD). */
export function weekStart(date: string) {
  return addDays(date, 1 - isoWeekday(date));
}

/** Nombres de los días ISO (1 = lunes … 7 = domingo). */
export const WEEKDAY_NAMES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

/** Días de registro del kilometraje semanal si no se han elegido (lunes y martes). */
export const DEFAULT_CAPTURE_DAYS = [1, 2];

/** El día de esa fecha es uno de los días de registro que eligió el admin (igual que en la BD). */
export function isWeeklyCaptureDay(date: string, days: readonly number[]) {
  return days.includes(isoWeekday(date));
}

/** Hoy es el último día de registro de la semana. */
export function isLastCaptureDay(date: string, days: readonly number[]) {
  return isoWeekday(date) === Math.max(...days);
}

/** Siguiente fecha de registro después de esa fecha ("aaaa-mm-dd"). */
export function nextCaptureDate(date: string, days: readonly number[]) {
  for (let i = 1; i <= 7; i++) {
    const next = addDays(date, i);
    if (days.includes(isoWeekday(next))) return next;
  }
  return addDays(date, 7);
}

/** Nombre del día de una fecha: "jueves". */
export const weekdayName = (date: string) => WEEKDAY_NAMES[isoWeekday(date)];

const PLURAL_WEEKDAYS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"] as const;

/** [1, 2] → "los lunes y martes"; [4] → "los jueves". */
export function describeCaptureDays(days: readonly number[]) {
  return `los ${days.map((d) => PLURAL_WEEKDAYS[d]).join(" y ")}`;
}

/**
 * Tope del aviso "¿Seguro?" por semana (D15): 3,000 km las locales y 7,000 las
 * foráneas y las que no tienen operación. Si la última lectura es de hace varias
 * semanas, el tope se multiplica por esas semanas.
 */
export function weeklyJumpLimit(operation: "local" | "foraneo" | null, weeks: number) {
  return (operation === "local" ? 3000 : 7000) * Math.max(1, weeks);
}
