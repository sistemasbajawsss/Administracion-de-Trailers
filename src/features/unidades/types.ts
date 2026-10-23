import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export type UnitType = Enums["tipo_unidad"];
export type UnitOperation = Enums["operacion_unidad"];
export type UnitStatus = Enums["estatus_unidad"];

export const UNIT_TYPES = [
  "trailer",
  "caja",
  "camion_rabon",
  "pipa",
  "camioneta",
] as const satisfies readonly UnitType[];

export const UNIT_STATUSES = [
  "activo",
  "en_taller",
  "por_llegar",
  "baja",
] as const satisfies readonly UnitStatus[];

export const UNIT_OPERATIONS = ["local", "foraneo"] as const satisfies readonly UnitOperation[];

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  trailer: "Trailer",
  caja: "Caja",
  camion_rabon: "Camión rabón",
  pipa: "Pipa",
  camioneta: "Camioneta",
};

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  activo: "Activo",
  en_taller: "En taller",
  por_llegar: "Por llegar",
  baja: "Baja",
};

export const UNIT_OPERATION_LABELS: Record<UnitOperation, string> = {
  local: "Local",
  foraneo: "Foráneo",
};

/** Debe coincidir con public.prefijo_tipo_unidad() en la base de datos. */
export const UNIT_TYPE_PREFIX: Record<UnitType, string> = {
  trailer: "T",
  caja: "R",
  camion_rabon: "F",
  pipa: "P",
  camioneta: "C",
};

/** Longitudes de caja que ofrece el formulario (la BD acepta 10–60 pies). */
export const BOX_LENGTHS = [40, 50, 53] as const;

/** Grupos de la pantalla de unidades: Locales, Foráneos y Camionetas. */
export const UNIT_GROUPS = ["local", "foraneo", "camionetas"] as const;
export type UnitGroup = (typeof UNIT_GROUPS)[number];

export const UNIT_GROUP_LABELS: Record<UnitGroup, string> = {
  local: "Locales",
  foraneo: "Foráneos",
  camionetas: "Camionetas",
};

/** Tipos que se pueden elegir dentro de cada grupo. */
export const UNIT_TYPES_BY_GROUP: Record<UnitGroup, readonly UnitType[]> = {
  local: ["trailer", "caja", "camion_rabon", "pipa"],
  foraneo: ["trailer", "caja", "camion_rabon", "pipa"],
  camionetas: ["camioneta"],
};

export type UnitListItem = {
  id: string;
  economicNumber: string;
  type: UnitType;
  operation: UnitOperation | null;
  status: UnitStatus;
  driverName: string | null;
  lengthFt: number | null;
  make: string | null;
  model: string | null;
  plates: string | null;
  notes: string | null;
};

export type UnitDetail = UnitListItem & {
  driverId: string | null;
  year: number | null;
  vin: string | null;
};
