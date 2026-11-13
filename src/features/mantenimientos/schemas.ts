import { z } from "zod";

import { isRealDate } from "@/lib/utils/format";
import { parseKm } from "@/lib/utils/mileage";

import { MAINTENANCE_STATUSES, MAINTENANCE_VIEWS } from "./types";

/** Texto vacío, o un número entero (con o sin comas) dentro del rango. */
const optionalWhole = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => {
      if (value === "") return true;
      const n = parseKm(value);
      return n !== null && n >= min && n <= max;
    }, message);

/**
 * Agregar o editar un mantenimiento de una unidad (solo admin). De una sola
 * forma: cada cuántos km o cada cuántos meses (pedido del usuario, 2026-11-12),
 * y la última vez que se hizo. La BD vuelve a revisar
 * todo (cajas solo por meses, fecha no futura, nombre repetido).
 */
export const maintenanceSchema = z
  .object({
    name: z.string().trim().min(1, "Escribe el nombre").max(100, "Nombre: máximo 100 caracteres"),
    everyKm: optionalWhole(100, 1_000_000, "Kilometraje no válido (de 100 a 1,000,000)"),
    everyMonths: optionalWhole(1, 120, "Meses no válidos (de 1 a 120)"),
    lastDate: z.string().refine(isRealDate, "Elige la fecha"),
    lastKm: optionalWhole(0, 9_999_999, "Kilometraje: solo números"),
    /** Solo al agregar: otras unidades a las que también se aplica (cuentan desde hoy y su km actual). */
    alsoUnitIds: z.array(z.uuid()).max(200, "Demasiadas unidades a la vez"),
  })
  .superRefine((value, ctx) => {
    if (!value.everyKm && !value.everyMonths) {
      ctx.addIssue({ code: "custom", path: ["everyMonths"], message: "Escribe cada cuántos km o cada cuántos meses" });
    }
    if (value.everyKm && value.everyMonths) {
      ctx.addIssue({ code: "custom", path: ["everyMonths"], message: "Elige una sola forma: por kilometraje o por meses" });
    }
    if (value.everyKm && !value.lastKm) {
      ctx.addIssue({ code: "custom", path: ["lastKm"], message: "Escribe con cuántos km se hizo la última vez" });
    }
  });

export type MaintenanceInput = z.infer<typeof maintenanceSchema>;

/** Pestaña y estado elegidos en la página Mantenimientos (?vista=, ?estado=). Lo que no se entiende, se ignora. */
export const maintenanceFiltersSchema = z.object({
  vista: z.enum(MAINTENANCE_VIEWS).catch("correctivos"),
  estado: z.enum(MAINTENANCE_STATUSES).optional().catch(undefined),
});

export type MaintenanceFilters = z.infer<typeof maintenanceFiltersSchema>;
