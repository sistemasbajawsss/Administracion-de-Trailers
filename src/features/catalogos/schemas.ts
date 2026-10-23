import { z } from "zod";

/**
 * Un solo formulario para los tres catálogos. Teléfono y notas solo se
 * muestran (y guardan) en los catálogos que los tienen.
 */
export const catalogItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe el nombre")
    .max(120, "Máximo 120 caracteres"),
  phone: z
    .string()
    .trim()
    .max(30, "Máximo 30 caracteres")
    .regex(/^[0-9+()\-\s]*$/, "Solo números, espacios, +, ( ) y -"),
  notes: z.string().trim().max(1000, "Máximo 1000 caracteres"),
});

export type CatalogItemInput = z.infer<typeof catalogItemSchema>;
