import type { UnitOperation, UnitStatus, UnitType } from "@/features/unidades/types";
import type { Database } from "@/lib/supabase/database.types";
import type { LastMileage } from "@/lib/utils/mileage";

/** Tipo de servicio (5F, D14), con los nombres del usuario. Los servicios de antes no tienen. */
export type ServiceType = Database["public"]["Enums"]["tipo_servicio"];

export const SERVICE_TYPES = ["preventivo", "correctivo", "servicio"] as const satisfies readonly ServiceType[];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
  servicio: "Servicio",
};

/** Lo que significa cada tipo, como lo definió el usuario. */
export const SERVICE_TYPE_HINTS: Record<ServiceType, string> = {
  preventivo: "Antes de que algo falle, como balatas gastadas.",
  correctivo: "Lo que toca cada cierto kilometraje o tiempo, como el cambio de aceite.",
  servicio: "Cualquier otra reparación.",
};

/** Servicios de antes de la 5F. */
export const NO_SERVICE_TYPE_LABEL = "Sin tipo";

/** ¿Dónde se hizo? (5G). El proveedor es dónde se compró la pieza; esto, quién hizo el trabajo. */
export type ServicePlace = Database["public"]["Enums"]["lugar_servicio"];

export const SERVICE_PLACES = ["taller_propio", "taller_externo", "en_camino"] as const satisfies readonly ServicePlace[];

export const SERVICE_PLACE_LABELS: Record<ServicePlace, string> = {
  taller_propio: "Taller Realso",
  taller_externo: "Taller de fuera",
  en_camino: "En camino",
};

export const SERVICE_PLACE_HINTS: Record<ServicePlace, string> = {
  taller_propio: "Lo hicimos en nuestro taller.",
  taller_externo: "Lo hizo otro taller, en su local.",
  en_camino: "Se arregló en la carretera.",
};

/** Servicios de antes de la 5G. */
export const NO_PLACE_LABEL = "Sin dato";

/** Fuera y en camino dicen qué taller lo hizo; Taller Realso, no. */
export const placeNeedsWorkshop = (place: ServicePlace | "" | null) => place === "taller_externo" || place === "en_camino";

/**
 * ¿Quién puso las piezas? Solo se pregunta con Taller de fuera (pedido del
 * usuario, 2026-11-13). No se guarda aparte: "nosotros" = el servicio lleva
 * proveedor de las piezas; "taller" = no lleva.
 */
export const PARTS_BY = ["taller", "nosotros"] as const;
export type PartsBy = (typeof PARTS_BY)[number];

export const PARTS_BY_LABELS: Record<PartsBy, string> = {
  taller: "Todo lo hizo el taller",
  nosotros: "Nosotros llevamos piezas",
};

export const PARTS_BY_HINTS: Record<PartsBy, string> = {
  taller: "El taller puso las piezas y la mano de obra.",
  nosotros: "Compramos piezas y se las llevamos.",
};

export const placeAsksPartsBy = (place: ServicePlace | "" | null) => place === "taller_externo";

/**
 * ¿Se pide "Proveedor de las piezas"? (pedido del usuario, 2026-11-13)
 * En camino, no: el taller las pone. Taller de fuera, solo si nosotros llevamos
 * piezas. Taller Realso y los de antes, sí.
 */
export const placeHasSupplier = (place: ServicePlace | "" | null, partsBy: PartsBy | "" = "") =>
  place === "en_camino" ? false : place === "taller_externo" ? partsBy === "nosotros" : true;

/** "Taller Realso", "Taller Pérez", "Taller Pérez, en camino"; null si es de antes. */
export function describePlace(place: ServicePlace | null, workshop: string | null): string | null {
  if (!place) return null;
  if (place === "taller_propio") return SERVICE_PLACE_LABELS.taller_propio;
  const name = workshop ?? "Taller sin nombre";
  return place === "en_camino" ? `${name}, en camino` : name;
}

/** Unidad elegible en el formulario de servicio (las de baja o vendidas no aparecen). */
export type UnitOption = {
  id: string;
  economicNumber: string;
  type: UnitType;
  operation: UnitOperation | null;
  status: UnitStatus;
  /** "Caja · 53 pies", "Ford F-150". */
  detail: string;
  /** Estancia abierta en taller (5E), si la unidad está en taller. */
  shopStay: ShopStay | null;
  /** Su tipo lleva kilometraje (las cajas, dollys y góndolas no). */
  hasOdometer: boolean;
  /** Última lectura del odómetro (5F); null si no tiene o su tipo no lleva. */
  mileage: LastMileage | null;
};

/** Estancia abierta en taller de una unidad: a ella se liga un servicio con fecha igual o posterior a la entrada. */
export type ShopStay = { entryId: string; entryDate: string; fault: string };

/** Relación del servicio con el taller (5E). noEntry null = servicio de antes de la 5E (no se evalúa). */
export type ServiceShopLink = { entryId: string | null; noEntry: boolean | null; noEntryReason: string | null };

export type CategoryOption = { id: string; name: string; requiresConcept: boolean };
export type SupplierOption = { id: string; name: string };

export type ServiceListItem = {
  id: string;
  date: string;
  /** Total en texto exacto de la BD ("1750.25"). */
  total: string;
  expenseCount: number;
  edited: boolean;
  description: string | null;
  unit: { id: string; economicNumber: string; type: UnitType; typeName: string; hasOdometer: boolean };
  supplierName: string | null;
  /** null en servicios de antes de la 5F. */
  serviceType: ServiceType | null;
};

/** Renglón de la lista de gastos (un gasto, con la fecha de su servicio). */
export type ExpenseListItem = {
  id: string;
  serviceId: string;
  date: string;
  category: string;
  concept: string | null;
  /** Monto en pesos, en texto exacto de la BD. */
  amount: string;
  /** Solo en gastos en dólares. */
  usd: UsdAmount | null;
  receiptCount: number;
  /** Algún comprobante es PDF (para adelantar la carga del visor). */
  hasPdf: boolean;
  economicNumber: string | null;
};

/** Total y número de gastos con los mismos filtros (sumado en la BD). */
export type ExpenseSummary = { total: string; count: number };

/** Cantidad en dólares y tipo de cambio de un gasto en USD (texto exacto de la BD). */
export type UsdAmount = { amount: string; rate: string };

export type ExpenseLine = {
  id: string;
  categoryId: string;
  categoryName: string;
  concept: string | null;
  /** Monto en pesos (en USD lo calcula la BD). */
  amount: string;
  usd: UsdAmount | null;
};

export type ServiceDetail = ServiceListItem & {
  /** `updated_at` tal como viene de la BD (con microsegundos): versión para ediciones simultáneas (5I). */
  version: string;
  mileage: number | null;
  supplierId: string | null;
  createdBy: string;
  createdAt: string;
  expenses: ExpenseLine[];
  /** Mantenimientos programados que cumplió (5F); incluye los que después se quitaron. */
  maintenance: { id: string; name: string }[];
  /** ¿Dónde se hizo? (5G). null en los de antes. */
  place: ServicePlace | null;
  workshopId: string | null;
  workshopName: string | null;
  /** stay: fechas de su estancia (null si no tiene, o si el capturista ya no la ve porque cerró). */
  shop: ServiceShopLink & { stay: { entryDate: string; exitDate: string | null; fault: string } | null };
};

/** Un cambio de un campo: "Monto: $1,500.50 → $1,600.00". */
export type FieldChange = { field: string; before: string; after: string };

export type HistoryChange =
  | { kind: "service-created" }
  | { kind: "service-updated"; changes: FieldChange[] }
  | { kind: "service-deleted" }
  | { kind: "service-restored" }
  | { kind: "expense-added"; summary: string }
  | { kind: "expense-removed"; summary: string }
  | { kind: "expense-updated"; summary: string; changes: FieldChange[] }
  | { kind: "receipt-added"; fileName: string }
  | { kind: "receipt-removed"; fileName: string };

/** Cambios hechos en una misma operación (mismo momento, autor y motivo). */
export type HistoryEntry = {
  at: string;
  author: string;
  reason: string | null;
  changes: HistoryChange[];
};

/** Servicio eliminado que todavía se puede restaurar (copia guardada en el historial). */
export type DeletedService = {
  historyId: number;
  serviceId: string;
  unitEconomicNumber: string | null;
  date: string;
  totalCents: number;
  expenseCount: number;
  deletedAt: string;
  deletedBy: string;
  reason: string | null;
};

export type UnitTotals = {
  total: string;
  serviceCount: number;
  expenseCount: number;
  lastServiceDate: string | null;
};

/** Servicio en las listas cortas de Inicio (pendientes y últimos capturados). */
export type ServiceBrief = {
  id: string;
  date: string;
  total: string;
  economicNumber: string;
  unitType: UnitType;
  unitTypeName: string;
  author: string | null;
  receiptCount: number;
  serviceType: ServiceType | null;
  /** Solo en el aviso de servicios sin entrada a taller (5E). */
  noEntryReason?: string | null;
};

/** "Correctivo", o "Sin tipo" en los servicios de antes de la 5F (Reportes, Excel). */
export const serviceTypeLabel = (type: ServiceType | null) => (type ? SERVICE_TYPE_LABELS[type] : NO_SERVICE_TYPE_LABEL);
