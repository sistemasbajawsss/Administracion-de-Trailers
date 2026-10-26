import type { UnitOperation, UnitStatus, UnitType } from "@/features/unidades/types";

/** Unidad elegible en el formulario de servicio (las de baja no aparecen). */
export type UnitOption = {
  id: string;
  economicNumber: string;
  type: UnitType;
  operation: UnitOperation | null;
  status: UnitStatus;
  /** "Caja · 53 pies", "Ford F-150". */
  detail: string;
};

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
  unit: { id: string; economicNumber: string; type: UnitType };
  supplierName: string | null;
};

export type ExpenseLine = {
  id: string;
  categoryId: string;
  categoryName: string;
  concept: string | null;
  amount: string;
};

export type ServiceDetail = ServiceListItem & {
  mileage: number | null;
  supplierId: string | null;
  createdBy: string;
  createdAt: string;
  expenses: ExpenseLine[];
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
