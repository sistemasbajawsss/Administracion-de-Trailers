/**
 * Formatos de pantalla (es-MX). Los montos viajan como texto ("1500.50") desde la BD
 * y se convierten a centavos enteros para sumar: nunca se suman floats.
 */

const MONEY_FORMAT = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** Monto escrito por el usuario: dígitos, comas de miles opcionales y hasta 2 decimales. */
const AMOUNT_PATTERN = /^\d{1,10}(\.\d{0,2})?$/;

/** "1,500.5" → "1500.5"; null si no es un monto válido. */
export function normalizeAmount(value: string): string | null {
  const clean = value.replace(/[\s,$]/g, "");
  return AMOUNT_PATTERN.test(clean) ? clean : null;
}

/** "1500.5" → 150050. Exacto, sin pasar por float. */
export function toCents(value: string): number | null {
  const clean = normalizeAmount(value);
  if (clean === null) return null;
  const [whole, decimals = ""] = clean.split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

/** 150050 → "$1,500.50". */
export function formatCents(cents: number) {
  return MONEY_FORMAT.format(cents / 100);
}

/** "1500.50" (numeric de la BD como texto) → "$1,500.50". */
export function formatMoney(value: string | null | undefined) {
  return formatCents(value ? (toCents(value) ?? 0) : 0);
}

/** "2026-10-23" → "23/10/2026". Sin pasar por Date para no mover el día por la zona horaria. */
export function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** Fecha y hora de auditoría (timestamptz) en hora de Tijuana: "23/10/2026 14:05". */
export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Tijuana",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value)).replace(",", "");
}

/** Fecha de hoy en Tijuana como "aaaa-mm-dd" (la misma regla que usa la BD). */
export function todayInTijuana() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tijuana" }).format(new Date());
}

/** 250000 → "250,000 km". */
export function formatKm(value: number) {
  return `${new Intl.NumberFormat("es-MX").format(value)} km`;
}
