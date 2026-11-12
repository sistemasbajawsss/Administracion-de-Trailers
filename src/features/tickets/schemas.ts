import { z } from "zod";

import { isKmText } from "@/lib/utils/mileage";

import { TICKET_PRIORITIES } from "./types";

/** Levantar un ticket (admin y gerente). La BD vuelve a revisar la unidad. */
export const createTicketSchema = z.object({
  unitId: z.uuid("Elige la unidad"),
  fault: z.string().trim().min(1, "Describe la falla").max(1000, "Falla: máximo 1000 caracteres"),
  priority: z.enum(TICKET_PRIORITIES, "Elige la prioridad"),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/** Aceptar: el kilometraje (obligatorio si la unidad lleva odómetro; lo revisan el diálogo y el servidor). */
export const acceptTicketSchema = z.object({
  mileage: z.string().trim().max(20).refine(isKmText, "Kilometraje: solo números"),
});
export type AcceptTicketInput = z.infer<typeof acceptTicketSchema>;

/** Rechazar: siempre con motivo. */
export const rejectTicketSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Explica por qué lo rechazas (al menos 5 letras)")
    .max(1000, "Motivo: máximo 1000 caracteres"),
});
export type RejectTicketInput = z.infer<typeof rejectTicketSchema>;
