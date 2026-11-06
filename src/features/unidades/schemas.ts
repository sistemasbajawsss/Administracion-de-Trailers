import { z } from "zod";

import { isRealDate } from "@/lib/utils/format";

import {
  UNIT_OPERATIONS,
  UNIT_STATUSES,
  UNIT_TYPE_LABELS,
  UNIT_TYPE_PREFIX,
  UNIT_TYPES,
} from "./types";

/** "t-17 " → "T-17". La BD hace lo mismo con un trigger. */
export function normalizeEconomicNumber(value: string) {
  return value.replace(/\s/g, "").toUpperCase();
}

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max} caracteres`);

/**
 * Formulario de alta y edición de unidades. Todos los campos de texto llegan
 * como string (vacío = sin dato); la action los convierte a null.
 */
export const unitSchema = z
  .object({
    economicNumber: z.string().trim().min(1, "Escribe el número económico").max(20, "Número económico: máximo 20 caracteres"),
    type: z.enum(UNIT_TYPES, "Elige el tipo de unidad"),
    operation: z.enum(UNIT_OPERATIONS).or(z.literal("")),
    status: z.enum(UNIT_STATUSES),
    driverId: z.string(),
    lengthFt: z.string(),
    plates: optionalText(20, "Placas"),
    make: optionalText(60, "Marca"),
    model: optionalText(60, "Modelo"),
    year: z.string().trim(),
    vin: optionalText(30, "VIN"),
    notes: optionalText(1000, "Notas"),
  })
  .superRefine((unit, ctx) => {
    const number = normalizeEconomicNumber(unit.economicNumber);
    const prefix = UNIT_TYPE_PREFIX[unit.type];

    if (!/^[A-Z]+-\d+$/.test(number)) {
      ctx.addIssue({
        code: "custom",
        path: ["economicNumber"],
        message: `Usa el formato ${prefix}-17: letra, guion y número`,
      });
    } else if (number.split("-")[0] !== prefix) {
      ctx.addIssue({
        code: "custom",
        path: ["economicNumber"],
        message: `Un ${UNIT_TYPE_LABELS[unit.type].toLowerCase()} empieza con ${prefix}-`,
      });
    }

    if (unit.type !== "camioneta" && !unit.operation) {
      ctx.addIssue({ code: "custom", path: ["operation"], message: "Elige si es local o foránea" });
    }

    if (unit.lengthFt) {
      const length = Number(unit.lengthFt);
      if (unit.type !== "caja") {
        ctx.addIssue({ code: "custom", path: ["lengthFt"], message: "Solo las cajas tienen longitud" });
      } else if (!Number.isInteger(length) || length < 10 || length > 60) {
        ctx.addIssue({ code: "custom", path: ["lengthFt"], message: "Longitud entre 10 y 60 pies" });
      }
    }

    if (unit.year) {
      const year = Number(unit.year);
      if (!Number.isInteger(year) || year < 1950 || year > 2100) {
        ctx.addIssue({ code: "custom", path: ["year"], message: "Año entre 1950 y 2100" });
      }
    }

    if (unit.vin && !/^[A-Z0-9]{5,30}$/.test(unit.vin.replace(/\s/g, "").toUpperCase())) {
      ctx.addIssue({ code: "custom", path: ["vin"], message: "El VIN solo lleva letras y números" });
    }
  });

export type UnitInput = z.infer<typeof unitSchema>;

/** Frase que hay que escribir para eliminar una unidad por completo (D5). La BD exige la misma. */
export const DELETE_UNIT_PHRASE = "ELIMINAR REGISTRO";

export const deleteUnitSchema = z.object({
  confirmation: z.literal(DELETE_UNIT_PHRASE, `Escribe ${DELETE_UNIT_PHRASE} para confirmar`),
});

export const unitFiltersSchema = z.object({
  grupo: z.enum(["local", "foraneo", "camionetas"]).catch("local"),
  q: z.string().trim().max(20).catch(""),
  tipo: z.enum(UNIT_TYPES).optional().catch(undefined),
  estatus: z.enum(UNIT_STATUSES).optional().catch(undefined),
  sinChofer: z.literal("1").optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).catch(1),
});

export type UnitFilters = z.infer<typeof unitFiltersSchema>;

/** Marcar como vendida (solo admin). La BD vuelve a revisar la fecha y el rol. */
export const sellUnitSchema = z.object({
  date: z.string().refine(isRealDate, "Elige la fecha de venta"),
  note: z.string().trim().max(1000, "Nota: máximo 1000 caracteres"),
});

export type SellUnitInput = z.infer<typeof sellUnitSchema>;

/** Deshacer una venta (solo admin), con motivo. */
export const undoSaleSchema = z.object({
  reason: z.string().trim().min(1, "Escribe el motivo").max(1000, "Motivo: máximo 1000 caracteres"),
});