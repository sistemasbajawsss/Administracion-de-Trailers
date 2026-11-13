import type { StayTicket } from "@/features/tickets/types";
import type { Database } from "@/lib/supabase/database.types";
import type { LastMileage } from "@/lib/utils/mileage";

type Enums = Database["public"]["Enums"];

/** Clave del catálogo tipos_unidad ("trailer", "caja", "dolly"…). El admin agrega tipos en Catálogos. */
export type UnitType = string;
export type UnitOperation = Enums["operacion_unidad"];
export type UnitStatus = Enums["estatus_unidad"];

/** Un tipo de unidad del catálogo: su letra y qué datos lleva. */
export type UnitTypeInfo = {
  key: string;
  name: string;
  /** Letra del número económico: T de T-17. */
  prefix: string;
  /** Tiene odómetro: se le pide kilometraje (las cajas, dollys y góndolas no). */
  hasOdometer: boolean;
  /** Se captura su largo en pies (las cajas). */
  hasLength: boolean;
  /** Es local o foránea; si no, va con las camionetas. */
  hasOperation: boolean;
  active: boolean;
};

/** Catálogo de tipos por clave, en el orden de las listas. */
export type UnitTypeCatalog = Record<string, UnitTypeInfo>;

/** "Caja", o la clave si el tipo no está en el catálogo. */
export const unitTypeName = (catalog: UnitTypeCatalog, key: string) => catalog[key]?.name ?? key;

/** Sin odómetro: no lleva kilometraje (un tipo desconocido se trata como que sí, igual que la BD). */
export const hasOdometer = (catalog: UnitTypeCatalog, key: string) => catalog[key]?.hasOdometer ?? true;

/** Tipos de un grupo de la pantalla de unidades (Camionetas = los que no son locales ni foráneos). */
export const unitTypesOfGroup = (catalog: UnitTypeCatalog, group: UnitGroup, includeInactive = false) =>
  Object.values(catalog).filter(
    (t) => (includeInactive || t.active) && (group === "camionetas" ? !t.hasOperation : t.hasOperation),
  );

export const UNIT_TYPE_KEY = /^[a-z][a-z0-9_]{1,39}$/;

export const UNIT_STATUSES = [
  "activo",
  "en_taller",
  "por_llegar",
  "baja",
  "vendida",
] as const satisfies readonly UnitStatus[];

export const UNIT_OPERATIONS = ["local", "foraneo"] as const satisfies readonly UnitOperation[];

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  activo: "Activo",
  en_taller: "En taller",
  por_llegar: "Por llegar",
  baja: "Baja",
  vendida: "Vendida",
};

export const UNIT_OPERATION_LABELS: Record<UnitOperation, string> = {
  local: "Local",
  foraneo: "Foráneo",
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

/** Grupo de una unidad: sin operación (local / foráneo) va con las camionetas. */
export const unitGroupOf = (operation: UnitOperation | null): UnitGroup => operation ?? "camionetas";

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
  /** `updated_at` tal como viene de la BD: versión para ediciones simultáneas (5I). */
  version: string;
  driverId: string | null;
  year: number | null;
  vin: string | null;
};

/** Estatus que sacan a una unidad de la operación: el capturista no la ve ni se le registran servicios. */
export const RETIRED_STATUSES = ["baja", "vendida"] as const satisfies readonly UnitStatus[];

export const isRetired = (status: UnitStatus) => (RETIRED_STATUSES as readonly UnitStatus[]).includes(status);

/** Unidad en taller ahora (Inicio): de su entrada abierta (5E). */
export type UnitInShop = {
  id: string;
  economicNumber: string;
  type: UnitType;
  operation: UnitOperation | null;
  entryDate: string;
  fault: string;
  /** Nombre del admin que aprobó su ticket (5H): va primero. null si entró de otra forma. */
  approvedBy: string | null;
  approved: boolean;
};

/** Una estancia en taller de la unidad (ficha, 5E). exitDate null = sigue en taller. */
export type UnitShopStay = {
  id: string;
  entryDate: string;
  exitDate: string | null;
  fault: string;
  exitNote: string | null;
  reportedBy: string | null;
  serviceCount: number;
  /** Lo gastado en sus servicios, texto exacto de la BD. */
  total: string;
  /** Servicio que le dio la salida (casilla "sale de taller"); null si salió con "Dar salida" o por venta. */
  exitServiceId: string | null;
  services: { id: string; date: string; total: string; description: string | null; supplier: string | null }[];
  /** Ticket de taller que la abrió al aceptarlo (5H, D16); null si fue entrada directa. */
  ticket: StayTicket | null;
};

/** Venta vigente de una unidad (Sección 5E). */
export type UnitSale = {
  date: string;
  note: string | null;
  soldBy: string | null;
};

/** Corrección del kilometraje hecha por el admin (5F): reinicia la cuenta desde su fecha. */
export type MileageCorrection = {
  id: string;
  date: string;
  km: number;
  /** Lo que marcaba antes (null si no tenía lecturas). */
  previousKm: number | null;
  reason: string;
  author: string | null;
  createdAt: string;
};

/** Kilometraje en la ficha: última lectura y correcciones (estas solo las ven admin y gerente). */
export type UnitMileage = {
  last: LastMileage | null;
  corrections: MileageCorrection[];
};

/** De dónde salió la última lectura, para la ficha: "Al 04/11/2026, en un servicio". */
export const MILEAGE_SOURCE_LABELS: Record<LastMileage["source"], string> = {
  servicio: "en un servicio",
  "entrada a taller": "en una entrada a taller",
  "corrección": "por corrección del administrador",
  "lectura semanal": "en la lectura semanal",
};
