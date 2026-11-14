/**
 * Cierre de mes (5I, D17), del lado de la pantalla. La regla manda en la BD
 * (mes_cerrado); aquí solo se usa para no ofrecer lo que la BD va a rechazar.
 *
 * `openMonths`: meses que ya terminaron y siguen abiertos (meses_abiertos()).
 * Todo mes anterior al actual que no esté ahí está cerrado.
 */
export type MonthLock = {
  /** Hoy en Tijuana, "aaaa-mm-dd". */
  today: string;
  /** "aaaa-mm-01" de cada mes pasado que sigue abierto. */
  openMonths: string[];
  /** Día del mes siguiente en que un mes se cierra solo. */
  closeDay: number;
};

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-10-15" -> "2026-10-01". */
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

/** "2026-10-15" -> "octubre de 2026". */
export function monthName(date: string) {
  return `${MONTHS[Number(date.slice(5, 7)) - 1] ?? ""} de ${date.slice(0, 4)}`;
}

/** "octubre" (sin año). */
export function monthOnlyName(date: string) {
  return MONTHS[Number(date.slice(5, 7)) - 1] ?? "";
}

/** "2026-11-13" -> "2026-10-01". */
export function previousMonthStart(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;
}

export function isMonthClosed(date: string, lock: MonthLock) {
  if (!date) return false;
  const month = monthStart(date);
  if (month >= monthStart(lock.today)) return false;
  return !lock.openMonths.includes(month);
}

/** Primer día que el capturista todavía puede elegir (para el `min` del calendario). */
export function firstOpenDate(lock: MonthLock) {
  return [monthStart(lock.today), ...lock.openMonths].sort()[0] ?? monthStart(lock.today);
}

/**
 * Reportes, PDF y Excel: qué meses del periodo siguen abiertos (todavía pueden
 * cambiar). "Todos los meses de este periodo están cerrados." si ninguno.
 */
export function openMonthsNote(from: string, to: string, lock: MonthLock) {
  const current = monthStart(lock.today);
  const open: string[] = [];
  let month = monthStart(from);
  const last = monthStart(to);
  while (month <= last) {
    if (!isMonthClosed(month, lock)) open.push(month === current ? `${monthName(month)} (en curso)` : monthName(month));
    const year = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    month = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`;
  }
  if (!open.length) return "Todos los meses de este periodo están cerrados.";
  const list = open.length === 1 ? open[0] : `${open.slice(0, -1).join(", ")} y ${open[open.length - 1]}`;
  return `${open.length === 1 ? "Sigue abierto" : "Siguen abiertos"} (todavía pueden cambiar): ${list}.`;
}

/** Mensaje para quien no es admin. */
export function closedMonthMessage(date: string) {
  return `${capitalize(monthName(date))} ya está cerrado. Si falta algo, pídeselo al administrador.`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
