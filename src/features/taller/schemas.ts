import { z } from "zod";

import { isRealDate } from "@/lib/utils/format";
import { isKmText } from "@/lib/utils/mileage";

const date = (message: string) => z.string().refine(isRealDate, message);

/**
 * Registrar una entrada a taller. La BD vuelve a revisar todo (fecha futura, unidad
 * de baja o ya en taller, kilometraje que no cuadra). El kilometraje es obligatorio
 * salvo en cajas (5F): eso depende de la unidad y lo revisan el formulario y el servidor.
 */
export const shopEntrySchema = z.object({
  unitId: z.uuid("Elige la unidad"),
  date: date("Elige la fecha de entrada"),
  mileage: z.string().trim().refine(isKmText, "Kilometraje: solo números"),
  fault: z.string().trim().min(1, "Describe la falla").max(1000, "Falla: máximo 1000 caracteres"),
});

export type ShopEntryInput = z.infer<typeof shopEntrySchema>;

/** Dar salida de taller. */
export const shopReleaseSchema = z.object({
  entryId: z.uuid(),
  date: date("Elige la fecha de salida"),
  note: z.string().trim().max(1000, "Nota: máximo 1000 caracteres"),
});

export type ShopReleaseInput = z.infer<typeof shopReleaseSchema>;
