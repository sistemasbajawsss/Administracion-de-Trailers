import { z } from "zod";

import { isRealDate } from "@/lib/utils/format";
import { parseKm } from "@/lib/utils/mileage";

import {
  UNIT_OPERATIONS,
  UNIT_STATUSES,
  UNIT_TYPE_KEY,
  type UnitTypeCatalog,
} from "./types";

/** "t-17 " → "T-17". La BD hace lo mismo con un trigger. */
export function normalizeEconomicNumber(value: string) {
  return value.replace(/\s/g, "").toUpperCase();
}

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max} caracteres`);

/**
 * Formulario de alta y edición de unidades. Todos los campos de texto llegan
 * como string (vacío = sin dato); la action los convierte a null. Las reglas
 * de cada tipo (letra, local/foráneo, largo) salen del catálogo; la BD las
 * vuelve a revisar.
 */
export const makeUnitSchema = (types: UnitTypeCatalog) =>
  z
    .object({
      economicNumber: z
        .string()
        .trim()
        .min(1, "Escribe el número económico")
        .max(20, "Número económico: máximo 20 caracteres"),
      type: z.string().regex(UNIT_TYPE_KEY, "Elige el tipo de unidad"),
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
      const type = types[unit.type];
      if (!type) {
        ctx.addIssue({
          code: "custom",
          path: ["type"],
          message: "Elige el tipo de unidad",
        });
        return;
      }
      const prefix = type.prefix;

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
          message: `Un ${type.name.toLowerCase()} empieza con ${prefix}-`,
        });
      }

      if (type.hasOperation && !unit.operation) {
        ctx.addIssue({
          code: "custom",
          path: ["operation"],
          message: "Elige si es local o foránea",
        });
      }

      if (unit.lengthFt) {
        const length = Number(unit.lengthFt);
        if (!type.hasLength) {
          ctx.addIssue({
            code: "custom",
            path: ["lengthFt"],
            message: `Un ${type.name.toLowerCase()} no lleva longitud`,
          });
        } else if (!Number.isInteger(length) || length < 10 || length > 60) {
          ctx.addIssue({
            code: "custom",
            path: ["lengthFt"],
            message: "Longitud entre 10 y 60 pies",
          });
        }
      }

      if (unit.year) {
        const year = Number(unit.year);
        if (!Number.isInteger(year) || year < 1950 || year > 2100) {
          ctx.addIssue({
            code: "custom",
            path: ["year"],
            message: "Año entre 1950 y 2100",
          });
        }
      }

      if (
        unit.vin &&
        !/^[A-Z0-9]{5,30}$/.test(unit.vin.replace(/\s/g, "").toUpperCase())
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["vin"],
          message: "El VIN solo lleva letras y números",
        });
      }
    });

export type UnitInput = z.infer<ReturnType<typeof makeUnitSchema>>;

/** Frase que hay que escribir para eliminar una unidad por completo (D5). La BD exige la misma. */
export const DELETE_UNIT_PHRASE = "ELIMINAR REGISTRO";

export const deleteUnitSchema = z.object({
  confirmation: z.literal(
    DELETE_UNIT_PHRASE,
    `Escribe ${DELETE_UNIT_PHRASE} para confirmar`,
  ),
});

export const unitFiltersSchema = z.object({
  grupo: z.enum(["local", "foraneo", "camionetas"]).catch("local"),
  q: z.string().trim().max(20).catch(""),
  tipo: z.string().regex(UNIT_TYPE_KEY).optional().catch(undefined),
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
  reason: z
    .string()
    .trim()
    .min(1, "Escribe el motivo")
    .max(1000, "Motivo: máximo 1000 caracteres"),
});
/** Corregir el kilometraje de una unidad (solo admin, 5F). La BD vuelve a revisar rol, fecha y caja. */
export const correctMileageSchema = z.object({
  mileage: z
    .string()
    .trim()
    .min(1, "Escribe el kilometraje correcto")
    .refine((value) => parseKm(value) !== null, "Kilometraje: solo números"),
  date: z.string().refine(isRealDate, "Elige desde qué fecha"),
  reason: z
    .string()
    .trim()
    .min(5, "Explica el motivo (mínimo 5 letras)")
    .max(500, "Motivo: máximo 500 caracteres"),
});

export type CorrectMileageInput = z.infer<typeof correctMileageSchema>;

/**
 * Tipo de unidad nuevo (Catálogos, solo admin). La letra y las tres reglas ya no
 * se cambian después (las unidades numeradas dependen de ellas); el nombre sí.
 */
export const unitTypeSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(40, "Nombre: máximo 40 caracteres"),
  prefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{1,3}$/, "De 1 a 3 letras, sin números ni acentos"),
  hasOdometer: z.boolean(),
  hasLength: z.boolean(),
  hasOperation: z.boolean(),
});

export type UnitTypeInput = z.infer<typeof unitTypeSchema>;

export const renameUnitTypeSchema = unitTypeSchema.pick({ name: true });
