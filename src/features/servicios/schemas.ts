import { z } from "zod";

import { normalizeAmount, toCents } from "@/lib/utils/format";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Un renglón de gasto. id vacío = renglón nuevo. El monto viaja como texto. */
export const expenseLineSchema = z.object({
  id: z.string(),
  categoryId: z.string().min(1, "Elige la categoría"),
  concept: z.string().trim().max(200, "Concepto: máximo 200 caracteres"),
  amount: z
    .string()
    .trim()
    .min(1, "Escribe el monto")
    .refine((value) => normalizeAmount(value) !== null, "Monto no válido (ejemplo: 1500.50)")
    .refine((value) => (toCents(value) ?? 0) > 0, "El monto debe ser mayor a $0"),
});

export type ExpenseLineInput = z.infer<typeof expenseLineSchema>;

/**
 * Formulario de servicio. Mismo schema en cliente y servidor; las reglas que
 * dependen de otras tablas (cajas sin km, "Otros" con concepto, unidad de baja)
 * también las aplica la BD.
 */
export const serviceSchema = z.object({
  unitId: z.string().min(1, "Elige la unidad"),
  date: z
    .string()
    .regex(DATE_PATTERN, "Elige la fecha")
    .refine((value) => value >= "2000-01-01", "Fecha no válida"),
  mileage: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{1,7}$/.test(value.replace(/,/g, "")), "Kilometraje: solo números"),
  supplierId: z.string(),
  description: z.string().trim().max(1000, "Descripción: máximo 1000 caracteres"),
  expenses: z.array(expenseLineSchema).min(1, "Agrega al menos un gasto"),
});

export type ServiceInput = z.infer<typeof serviceSchema>;

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
  desde: z.string().regex(DATE_PATTERN).optional().catch(undefined),
  hasta: z.string().regex(DATE_PATTERN).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).catch(1),
});

export type ServiceFilters = z.infer<typeof serviceFiltersSchema>;
