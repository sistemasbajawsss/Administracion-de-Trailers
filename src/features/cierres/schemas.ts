import { z } from "zod";

/** Primer día de un mes, "aaaa-mm-01". */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, "Mes no válido");

export const reopenMonthSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Explica por qué se reabre (mínimo 5 letras)")
    .max(500, "Motivo: máximo 500 caracteres"),
});

export const closeDaySchema = z.number().int().min(1, "Del 1 al 28").max(28, "Del 1 al 28");
