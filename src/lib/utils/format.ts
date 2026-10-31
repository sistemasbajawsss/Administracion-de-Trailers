/**
 * Formatos de pantalla (es-MX). Los montos viajan como texto ("1500.50") desde la BD
 * y se convierten a centavos enteros para sumar: nunca se suman floats.
 */

const MONEY_FORMAT = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** Monto ya sin comas: hasta 10 dígitos y hasta 2 decimales. */
const AMOUNT_PATTERN = /^\d{1,10}(\.\d{0,2})?$/;
/** Comas de miles bien puestas: "1,500" o "12,345.50". */
const THOUSANDS_PATTERN = /^\d{1,3}(,\d{3})+(\.\d*)?$/;
/** Una sola coma con 1 o 2 dígitos al final: teclado con coma decimal ("1500,50"). */
const DECIMAL_COMMA_PATTERN = /^\d+,\d{1,2}$/;

/**
 * Quita espacios y "$" y resuelve la coma: de miles si está bien puesta, decimal si
 * es una sola con 1–2 dígitos al final. Cualquier otra coma es ambigua: null.
 * Antes se borraban todas las comas y "1500,50" se guardaba como 150,050.
 */
function resolveCommas(value: string): string | null {
  const clean = value.replace(/[\s$]/g, "");
  if (!clean.includes(",")) return clean;
  if (THOUSANDS_PATTERN.test(clean)) return clean.replaceAll(",", "");
  if (DECIMAL_COMMA_PATTERN.test(clean)) return clean.replace(",", ".");
  return null;
}

/** "1,500.5" → "1500.5"; "1500,5" → "1500.5"; null si no es un monto válido. */
export function normalizeAmount(value: string): string | null {
  const clean = resolveCommas(value);
  return clean !== null && AMOUNT_PATTERN.test(clean) ? clean : null;
}

/** Monto como lo regresa la BD (numeric en texto): con signo y cualquier número de decimales. */
const DB_AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * "1500.5" → 150050. Exacto, sin pasar por float. Acepta lo que escribe el usuario
 * y también lo que regresa la BD (negativos o más de 2 decimales, redondeando la
 * mitad hacia arriba): así un valor fuera de lo común no se muestra como $0.00.
 */
export function toCents(value: string): number | null {
  const clean = normalizeAmount(value);
  if (clean !== null) {
    const [whole, decimals = ""] = clean.split(".");
    return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  }
  const match = DB_AMOUNT_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, sign, whole, decimals = ""] = match;
  const cents = Number(whole) * 100 + Number(decimals.slice(0, 2).padEnd(2, "0")) + (Number(decimals[2] ?? 0) >= 5 ? 1 : 0);
  return sign ? -cents : cents;
}

/** 150050 → "$1,500.50". */
export function formatCents(cents: number) {
  return MONEY_FORMAT.format(cents / 100);
}

/** "1500.50" (numeric de la BD como texto) → "$1,500.50". */
export function formatMoney(value: string | null | undefined) {
  return formatCents(value ? (toCents(value) ?? 0) : 0);
}

const USD_FORMAT = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1200.5" → "US$1,200.50" (para distinguirlo de los pesos). */
export function formatUsd(value: string | null | undefined) {
  return `US$${USD_FORMAT.format((value ? (toCents(value) ?? 0) : 0) / 100)}`;
}

/** Tipo de cambio escrito por el usuario: pesos por dólar con hasta 4 decimales. */
const RATE_PATTERN = /^\d{1,3}(\.\d{0,4})?$/;

/** " 18.45 " → "18.45"; "18,45" → "18.45"; null si no es un tipo de cambio válido. */
export function normalizeRate(value: string): string | null {
  const clean = value.replace(/[\s$]/g, "");
  const dotted = /^\d+,\d{1,4}$/.test(clean) ? clean.replace(",", ".") : clean;
  return RATE_PATTERN.test(dotted) ? dotted : null;
}

/** "18.45" → 184500 (diezmilésimos). Exacto, sin pasar por float. */
export function toRateUnits(value: string): number | null {
  const clean = normalizeRate(value);
  if (clean === null) return null;
  const [whole, decimals = ""] = clean.split(".");
  return Number(whole) * 10000 + Number(decimals.padEnd(4, "0"));
}

/** "18.4500" → "18.4500" con 4 decimales fijos, como lo guarda la BD. */
export function formatRate(value: string) {
  const units = toRateUnits(value) ?? 0;
  return `${Math.floor(units / 10000)}.${String(units % 10000).padStart(4, "0")}`;
}

/**
 * Centavos de dólar × tipo de cambio → centavos de peso, redondeando la mitad
 * hacia arriba igual que round() de Postgres. BigInt: el producto puede pasar de 2^53.
 * Es solo la vista previa: el monto oficial lo calcula la BD.
 */
export function usdToMxnCents(usdCents: number, rateUnits: number) {
  return Number((BigInt(usdCents) * BigInt(rateUnits) + BigInt(5000)) / BigInt(10000));
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
