import { z } from "zod";

import { isRealDate, normalizeAmount, toCents, toRateUnits } from "@/lib/utils/format";

import { SERVICE_TYPES, type ShopStay } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const CURRENCIES = ["MXN", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Rango aceptado del tipo de cambio (la BD acepta hasta 100; esto ataja errores de dedo como 184.5). */
export const MIN_RATE = 5;
export const MAX_RATE = 50;
/** US$199,999,999.99 × 50 = $9,999,999,999.50: lo máximo que cabe en pesos. */
const MAX_USD_CENTS = 19_999_999_999;

/**
 * Un renglón de gasto. id vacío = renglón nuevo. El monto viaja como texto y
 * está en la moneda del renglón: en USD, la BD calcula el monto en pesos con el
 * tipo de cambio.
 */
export const expenseLineSchema = z
  .object({
    id: z.union([z.literal(""), z.uuid()]),
    categoryId: z.uuid("Elige la categoría"),
    concept: z.string().trim().max(200, "Concepto: máximo 200 caracteres"),
    currency: z.enum(CURRENCIES),
    amount: z
      .string()
      .trim()
      .min(1, "Escribe el monto")
      .refine((value) => normalizeAmount(value) !== null, "Monto no válido (ejemplo: 1500.50)")
      .refine((value) => (toCents(value) ?? 0) > 0, "El monto debe ser mayor a 0"),
    exchangeRate: z.string().trim(),
  })
  .superRefine((line, ctx) => {
    if (line.currency !== "USD") return;
    // Con el tipo de cambio máximo, los pesos deben caber en numeric(12,2).
    if ((toCents(line.amount) ?? 0) > MAX_USD_CENTS) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Monto en dólares demasiado grande" });
    }
    const units = toRateUnits(line.exchangeRate);
    if (!line.exchangeRate) {
      ctx.addIssue({ code: "custom", path: ["exchangeRate"], message: "Escribe el tipo de cambio" });
    } else if (units === null) {
      ctx.addIssue({ code: "custom", path: ["exchangeRate"], message: "Tipo de cambio no válido (ejemplo: 18.4520)" });
    } else if (units < MIN_RATE * 10000 || units > MAX_RATE * 10000) {
      ctx.addIssue({
        code: "custom",
        path: ["exchangeRate"],
        message: `El tipo de cambio debe estar entre ${MIN_RATE} y ${MAX_RATE} pesos`,
      });
    }
  });

export type ExpenseLineInput = z.infer<typeof expenseLineSchema>;

/**
 * Formulario de servicio. Mismo schema en cliente y servidor; las reglas que
 * dependen de otras tablas (cajas sin km, "Otros" con concepto, unidad de baja)
 * también las aplica la BD.
 */
export const serviceSchema = z.object({
  unitId: z.uuid("Elige la unidad"),
  date: z
    .string()
    .regex(DATE_PATTERN, "Elige la fecha")
    .refine(isRealDate, "Fecha no válida")
    .refine((value) => value >= "2000-01-01", "Fecha no válida"),
  mileage: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{1,7}$/.test(value.replace(/,/g, "")), "Kilometraje: solo números"),
  /** Tipo de servicio (5F). Vacío solo al editar uno de antes; en alta lo exigen el formulario y el servidor. */
  serviceType: z.union([z.literal(""), z.enum(SERVICE_TYPES)]),
  supplierId: z.union([z.literal(""), z.uuid()]),
  description: z.string().trim().max(1000, "Descripción: máximo 1000 caracteres"),
  expenses: z.array(expenseLineSchema).min(1, "Agrega al menos un gasto").max(50, "Máximo 50 gastos por servicio"),
  // ---- Taller (5E, D13) ----
  /** Casilla "La unidad sale de taller con este servicio". */
  leavesShop: z.boolean(),
  /** Por qué no tuvo entrada a taller (solo si el servicio no queda ligado a una estancia). */
  noEntryReason: z.string().trim().max(300, "Motivo: máximo 300 caracteres"),
  /** "Se olvidó la entrada": se registra con el servicio (solo en alta y si la unidad no está en taller). */
  forgotEntry: z.boolean(),
  forgotEntryDate: z.union([z.literal(""), z.string().regex(DATE_PATTERN).refine(isRealDate, "Fecha no válida")]),
  forgotEntryFault: z.string().trim().max(1000, "Falla: máximo 1000 caracteres"),
});

export type ServiceInput = z.infer<typeof serviceSchema>;

/** Motivos rápidos cuando la unidad no tuvo entrada a taller (D13). Además: "Se olvidó la entrada" y "Otro…". */
export const NO_ENTRY_REASONS = ["Reparación en camino", "Mantenimiento en patio"] as const;

/** ¿El servicio queda dentro de la estancia abierta? (misma regla que preparar_servicio en la BD). */
export const fallsInStay = (stay: ShopStay | null, date: string) => Boolean(stay && date >= stay.entryDate);

/**
 * Reglas de taller del formulario, iguales en el navegador y en el servidor.
 * `stay`: estancia abierta de la unidad elegida. `linked`: el servicio queda ligado
 * a una estancia (abierta o, al editar, la que ya tenía). `needsReason`: falta
 * motivo si no queda ligado (al editar, no si ya tenía uno o es de antes de la 5E).
 */
export function shopIssues(
  values: Pick<ServiceInput, "date" | "noEntryReason" | "forgotEntry" | "forgotEntryDate" | "forgotEntryFault">,
  { stay, linked, needsReason, allowForgot }: { stay: ShopStay | null; linked: boolean; needsReason: boolean; allowForgot: boolean },
): { path: "noEntryReason" | "forgotEntryDate" | "forgotEntryFault"; message: string }[] {
  if (linked) return [];
  if (values.forgotEntry && allowForgot) {
    const issues: ReturnType<typeof shopIssues> = [];
    if (stay) issues.push({ path: "noEntryReason", message: "La unidad ya está en taller: no se puede registrar otra entrada" });
    if (!values.forgotEntryDate) issues.push({ path: "forgotEntryDate", message: "Elige la fecha en que entró a taller" });
    else if (values.forgotEntryDate > values.date) {
      issues.push({ path: "forgotEntryDate", message: "La entrada no puede ser después del servicio" });
    }
    if (!values.forgotEntryFault.trim()) issues.push({ path: "forgotEntryFault", message: "Describe la falla" });
    return issues;
  }
  if (needsReason && !values.noEntryReason.trim()) {
    return [{ path: "noEntryReason", message: "Elige o escribe por qué no tuvo entrada a taller" }];
  }
  return [];
}

/** Edición: el mismo formulario más el motivo obligatorio (D1). */
export const serviceEditSchema = serviceSchema.extend({
  reason: z
    .string()
    .trim()
    .min(5, "Explica el motivo del cambio (mínimo 5 letras)")
    .max(500, "Motivo: máximo 500 caracteres"),
});

export type ServiceEditInput = z.infer<typeof serviceEditSchema>;

export const deleteServiceSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Explica por qué se elimina (mínimo 5 letras)")
    .max(500, "Motivo: máximo 500 caracteres"),
});

export const restoreServiceSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Explica por qué se restaura (mínimo 5 letras)")
    .max(500, "Motivo: máximo 500 caracteres"),
});

/** Frase para eliminar para siempre un servicio ya eliminado. La BD exige la misma. */
export const PURGE_SERVICE_PHRASE = "ELIMINAR REGISTRO";

export const purgeServiceSchema = z.object({
  confirmation: z.literal(PURGE_SERVICE_PHRASE, `Escribe ${PURGE_SERVICE_PHRASE} para confirmar`),
});

/** Filtros de la lista de gastos (en la URL). q: número económico; buscar: categoría o concepto. */
export const serviceFiltersSchema = z.object({
  q: z.string().trim().max(20).catch(""),
  buscar: z.string().trim().max(60).catch(""),
  desde: z.string().refine(isRealDate).optional().catch(undefined),
  hasta: z.string().refine(isRealDate).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).catch(1),
});

export type ServiceFilters = z.infer<typeof serviceFiltersSchema>;

/** Fecha para sugerir el tipo de cambio de Banxico. */
export const exchangeRateDateSchema = z.string().refine(isRealDate);
