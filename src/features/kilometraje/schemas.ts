import { z } from "zod";

import { parseKm } from "@/lib/utils/mileage";

const kmText = z
  .string()
  .trim()
  .min(1, "Escribe el kilometraje")
  .max(12)
  .refine((value) => parseKm(value) !== null, "Kilometraje: solo números");

/** La lista de la semana: solo las unidades con kilometraje escrito. */
export const saveReadingsSchema = z
  .array(z.object({ unitId: z.uuid(), km: kmText }))
  .min(1, "Escribe al menos un kilometraje")
  .max(200, "Se pueden guardar hasta 200 lecturas a la vez");

export type SaveReadingsInput = z.infer<typeof saveReadingsSchema>;

const reasonText = z.string().trim().max(500, "El motivo puede tener hasta 500 caracteres");

/**
 * Corregir una lectura. El motivo es obligatorio salvo para quien la capturó, el
 * mismo día (`reasonRequired` lo decide la pantalla; la BD lo vuelve a revisar).
 */
export const makeCorrectReadingSchema = (reasonRequired: boolean) =>
  z.object({
    km: kmText,
    reason: reasonRequired ? reasonText.min(5, "Escribe el motivo (mínimo 5 letras)") : reasonText,
  });

export type CorrectReadingInput = z.infer<ReturnType<typeof makeCorrectReadingSchema>>;

/** En el servidor: el motivo se valida en la BD según quién corrige. */
export const correctReadingSchema = makeCorrectReadingSchema(false);

export const removeReadingSchema = z.object({ reason: reasonText });

export type RemoveReadingInput = z.infer<typeof removeReadingSchema>;

/** Días de registro (solo admin): uno o dos días de la semana, 1 = lunes … 7 = domingo. */
export const captureDaysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1, "Elige al menos un día")
  .max(2, "Elige uno o dos días")
  .refine((days) => new Set(days).size === days.length, "Un día está repetido");
