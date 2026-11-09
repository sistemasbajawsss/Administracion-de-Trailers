import { formatDate, formatKm } from "./format";

/** Última lectura del odómetro de una unidad (kilometraje_unidades en la BD). */
export type LastMileage = {
  km: number;
  /** aaaa-mm-dd */
  date: string;
  source: "servicio" | "entrada a taller" | "corrección";
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
