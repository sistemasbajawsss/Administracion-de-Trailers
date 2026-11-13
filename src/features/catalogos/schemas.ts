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

/** Unir un proveedor o taller repetido en otro (5I, D18). */
export const mergeCatalogSchema = z.object({
  targetId: z.uuid("Elige con cuál se une"),
  reason: z
    .string()
    .trim()
    .min(5, "Explica por qué se unen (mínimo 5 letras)")
    .max(500, "Motivo: máximo 500 caracteres"),
});

export type MergeCatalogInput = z.infer<typeof mergeCatalogSchema>;
