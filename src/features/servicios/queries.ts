import "server-only";

import { UNIT_TYPE_LABELS, type UnitType } from "@/features/unidades/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { formatDate, formatKm, formatMoney, toCents } from "@/lib/utils/format";

import type { ServiceFilters } from "./schemas";
import type {
  DeletedService,
  ExpenseListItem,
  ExpenseSummary,
  FieldChange,
  HistoryChange,
  HistoryEntry,
  ServiceBrief,
  ServiceDetail,
  ServiceListItem,
  UnitOption,
  UnitTotals,
} from "./types";

// Los montos se piden como texto (::text) para no convertirlos a float.
const LIST_COLUMNS =
  "id, fecha, total::text, num_gastos, editado, descripcion, unidad:unidades!inner(id, numero_economico, tipo), proveedor:proveedores(nombre)";

type ServiceRow = {
  id: string;
  fecha: string;
  total: string;
  num_gastos: number;
  editado: boolean;
  descripcion: string | null;
  unidad: { id: string; numero_economico: string; tipo: UnitType };
  proveedor: { nombre: string } | null;
};

function toListItem(row: ServiceRow): ServiceListItem {
  return {
    id: row.id,
    date: row.fecha,
    total: row.total,
    expenseCount: row.num_gastos,
    edited: row.editado,
    description: row.descripcion,
    unit: { id: row.unidad.id, economicNumber: row.unidad.numero_economico, type: row.unidad.tipo },
    supplierName: row.proveedor?.nombre ?? null,
  };
}

export async function getService(id: string): Promise<ServiceDetail | null> {
  const supabase = await createClient();

  const [service, expenses] = await Promise.all([
    supabase
      .from("servicios_resumen")
      .select(`${LIST_COLUMNS}, kilometraje, proveedor_id, created_by, created_at`)
      .eq("id", id)
      .returns<
        (ServiceRow & {
          kilometraje: number | null;
          proveedor_id: string | null;
          created_by: string;
          created_at: string;
        })[]
      >()
      .maybeSingle(),
    supabase
      .from("gastos")
      .select("id, categoria_id, concepto, monto::text, categoria:categorias(nombre)")
      .eq("servicio_id", id)
      .order("created_at")
      .returns<
        {
          id: string;
          categoria_id: string;
          concepto: string | null;
          monto: string;
          categoria: { nombre: string } | null;
        }[]
      >(),
  ]);

  if (service.error || expenses.error) throw new Error("No se pudo cargar el servicio");
  if (!service.data) return null;

  const row = service.data;
  return {
    ...toListItem(row),
    mileage: row.kilometraje,
    supplierId: row.proveedor_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expenses: expenses.data.map((e) => ({
      id: e.id,
      categoryId: e.categoria_id,
      categoryName: e.categoria?.nombre ?? "Categoría",
      concept: e.concepto,
      amount: e.monto,
    })),
  };
}

// ---------------------------------------------------------------------------
// Lista de gastos (un renglón por gasto), por tandas
// ---------------------------------------------------------------------------

/** Renglones por tanda del scroll infinito. */
export const EXPENSES_BATCH_SIZE = 25;

export type ExpenseQuery = Pick<ServiceFilters, "q" | "buscar" | "desde" | "hasta"> & { unitId?: string };

const nullable = <T,>(value: T | null | undefined) => (value ?? null) as T;

/** Los filtros como argumentos de listar_gastos / resumen_gastos (todo filtra en SQL). */
function expenseArgs(query: ExpenseQuery) {
  return {
    p_unidad_id: nullable(query.unitId),
    p_numero: nullable(query.q || null),
    p_busqueda: nullable(query.buscar || null),
    p_desde: nullable(query.desde),
    p_hasta: nullable(query.hasta),
  };
}

/**
 * Una tanda de gastos, del más reciente al más viejo. RLS decide el alcance
 * (el capturista solo recibe los suyos).
 */
export async function listExpenses(query: ExpenseQuery, offset = 0): Promise<ExpenseListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("listar_gastos", { ...expenseArgs(query), p_limite: EXPENSES_BATCH_SIZE, p_desde_renglon: offset })
    .select("id, servicio_id, fecha, categoria, concepto, monto::text, num_comprobantes, tiene_pdf, numero_economico")
    .returns<
      {
        id: string;
        servicio_id: string;
        fecha: string;
        categoria: string | null;
        concepto: string | null;
        monto: string;
        num_comprobantes: number;
        tiene_pdf: boolean;
        numero_economico: string | null;
      }[]
    >();

  if (error) throw new Error("No se pudieron cargar los gastos");
  return data.map((row) => ({
    id: row.id,
    serviceId: row.servicio_id,
    date: row.fecha,
    category: row.categoria ?? "Categoría",
    concept: row.concepto,
    amount: row.monto,
    receiptCount: row.num_comprobantes,
    hasPdf: row.tiene_pdf,
    economicNumber: row.numero_economico,
  }));
}

/** Total y número de gastos con los mismos filtros de la lista. */
export async function getExpenseSummary(query: ExpenseQuery): Promise<ExpenseSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("resumen_gastos", expenseArgs(query))
    .select("total::text, num_gastos")
    .returns<{ total: string; num_gastos: number }[]>()
    .single();

  if (error) throw new Error("No se pudo calcular el total");
  return { total: data.total, count: data.num_gastos };
}

/** Unidades para elegir en el formulario: todas menos las de baja, en orden natural. */
export async function listUnitOptions(): Promise<UnitOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select("id, numero_economico, tipo, operacion, estatus, longitud_pies, marca, modelo")
    .neq("estatus", "baja")
    .order("tipo")
    .order("numero_orden");

  if (error) throw new Error("No se pudieron cargar las unidades");

  return data.map((u) => {
    const parts: string[] = [UNIT_TYPE_LABELS[u.tipo]];
    if (u.longitud_pies) parts.push(`${u.longitud_pies} pies`);
    const makeModel = [u.marca, u.modelo].filter(Boolean).join(" ");
    if (makeModel) parts.push(makeModel);
    return {
      id: u.id,
      economicNumber: u.numero_economico,
      type: u.tipo,
      operation: u.operacion,
      status: u.estatus,
      detail: parts.join(" · "),
    };
  });
}

/**
 * Servicios eliminados que se pueden restaurar (solo admin, por RLS del historial
 * y por la página). Se descartan los que ya se restauraron. El total sale de la
 * copia guardada; se suma en centavos enteros, sin floats.
 */
export async function listDeletedServices(): Promise<DeletedService[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("historial_cambios")
    .select("id, servicio_id, datos_anteriores, motivo, autor_nombre, created_at")
    .eq("tabla", "servicios")
    .eq("accion", "delete")
    .order("id", { ascending: false })
    .limit(100);

  if (error) throw new Error("No se pudieron cargar los servicios eliminados");
  if (data.length === 0) return [];

  const serviceIds = [...new Set(data.map((row) => row.servicio_id))];
  const unitIds = [...new Set(data.map((row) => str(asRow(row.datos_anteriores).unidad_id)).filter(Boolean))];

  const [restored, units] = await Promise.all([
    supabase.from("servicios").select("id").in("id", serviceIds),
    supabase.from("unidades").select("id, numero_economico").in("id", unitIds),
  ]);
  if (restored.error || units.error) throw new Error("No se pudieron cargar los servicios eliminados");

  const restoredIds = new Set(restored.data.map((s) => s.id));
  const unitNames = new Map(units.data.map((u) => [u.id, u.numero_economico]));
  const seen = new Set<string>();

  return data.flatMap((row) => {
    // Si se eliminó, restauró y volvió a eliminar, solo cuenta la copia más reciente.
    if (restoredIds.has(row.servicio_id) || seen.has(row.servicio_id)) return [];
    seen.add(row.servicio_id);

    const snapshot = asRow(row.datos_anteriores);
    const expenses = Array.isArray(snapshot.gastos) ? snapshot.gastos.map(asRow) : [];
    return [
      {
        historyId: row.id,
        serviceId: row.servicio_id,
        unitEconomicNumber: unitNames.get(str(snapshot.unidad_id)) ?? null,
        date: str(snapshot.fecha),
        totalCents: expenses.reduce((sum, e) => sum + (toCents(str(e.monto)) ?? 0), 0),
        expenseCount: expenses.length,
        deletedAt: row.created_at,
        deletedBy: row.autor_nombre ?? "Usuario",
        reason: row.motivo,
      },
    ];
  });
}

/** Total invertido en una unidad (sumado en la BD) y cuántos gastos tiene. */
export async function getUnitTotals(unitId: string): Promise<UnitTotals> {
  const supabase = await createClient();
  const [totals, expenses] = await Promise.all([
    supabase
      .from("totales_por_unidad")
      .select("total::text, num_servicios, ultimo_servicio")
      .eq("unidad_id", unitId)
      .returns<{ total: string; num_servicios: number; ultimo_servicio: string | null }[]>()
      .maybeSingle(),
    supabase
      .from("gastos")
      .select("id, servicio:servicios!inner(unidad_id)", { count: "exact", head: true })
      .eq("servicio.unidad_id", unitId),
  ]);

  if (totals.error || expenses.error) throw new Error("No se pudo calcular el total de la unidad");
  return {
    total: totals.data?.total ?? "0",
    serviceCount: totals.data?.num_servicios ?? 0,
    expenseCount: expenses.count ?? 0,
    lastServiceDate: totals.data?.ultimo_servicio ?? null,
  };
}

// ---------------------------------------------------------------------------
// Historial de cambios
// ---------------------------------------------------------------------------

type HistoryRow = {
  id: number;
  tabla: "servicios" | "gastos" | "comprobantes";
  accion: "insert" | "update" | "delete";
  datos_anteriores: Json;
  datos_nuevos: Json;
  motivo: string | null;
  autor_nombre: string | null;
  created_at: string;
};

type Row = Record<string, Json | undefined>;
type Names = { units: Map<string, string>; suppliers: Map<string, string>; categories: Map<string, string> };

const asRow = (value: Json): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
const str = (value: Json | undefined) => (value === null || value === undefined ? "" : String(value));

function describeServiceField(field: string, value: Json | undefined, names: Names): string {
  const text = str(value);
  if (!text) return "—";
  switch (field) {
    case "unidad_id":
      return names.units.get(text) ?? "Unidad";
    case "proveedor_id":
      return names.suppliers.get(text) ?? "Proveedor";
    case "fecha":
      return formatDate(text);
    case "kilometraje":
      return formatKm(Number(text));
    default:
      return text;
  }
}

const SERVICE_FIELDS: [string, string][] = [
  ["unidad_id", "Unidad"],
  ["fecha", "Fecha"],
  ["kilometraje", "Kilometraje"],
  ["proveedor_id", "Proveedor"],
  ["descripcion", "Descripción"],
];

function expenseSummary(row: Row, names: Names) {
  const category = names.categories.get(str(row.categoria_id)) ?? "Gasto";
  const concept = str(row.concepto);
  return `${category}${concept ? ` · ${concept}` : ""} · ${formatMoney(str(row.monto))}`;
}

function diff(before: Row, after: Row, fields: [string, string][], describe: (field: string, value: Json | undefined) => string) {
  const changes: FieldChange[] = [];
  for (const [field, label] of fields) {
    if (str(before[field]) !== str(after[field])) {
      changes.push({ field: label, before: describe(field, before[field]), after: describe(field, after[field]) });
    }
  }
  return changes;
}

function toChange(row: HistoryRow, names: Names): HistoryChange | null {
  const before = asRow(row.datos_anteriores);
  const after = asRow(row.datos_nuevos);

  if (row.tabla === "servicios") {
    // Un alta con motivo solo la hace restaurar_servicio.
    if (row.accion === "insert") return row.motivo ? { kind: "service-restored" } : { kind: "service-created" };
    if (row.accion === "delete") return { kind: "service-deleted" };
    const changes = diff(before, after, SERVICE_FIELDS, (f, v) => describeServiceField(f, v, names));
    return changes.length ? { kind: "service-updated", changes } : null;
  }

  if (row.tabla === "comprobantes") {
    // Un comprobante no se edita: solo se agrega o se quita.
    if (row.accion === "insert") return { kind: "receipt-added", fileName: str(after.nombre_archivo) };
    return { kind: "receipt-removed", fileName: str(before.nombre_archivo) };
  }

  if (row.accion === "insert") return { kind: "expense-added", summary: expenseSummary(after, names) };
  if (row.accion === "delete") return { kind: "expense-removed", summary: expenseSummary(before, names) };
  const changes = diff(
    before,
    after,
    [
      ["categoria_id", "Categoría"],
      ["concepto", "Concepto"],
      ["monto", "Monto"],
    ],
    (field, value) => {
      const text = str(value);
      if (!text) return "—";
      if (field === "categoria_id") return names.categories.get(text) ?? "Categoría";
      if (field === "monto") return formatMoney(text);
      return text;
    },
  );
  return changes.length ? { kind: "expense-updated", summary: expenseSummary(before, names), changes } : null;
}

/**
 * Línea de cambios de un servicio, agrupada por operación (los renglones de
 * una misma edición comparten momento y motivo). RLS limita el capturista a
 * sus propios servicios. Los nombres de unidad, proveedor y categoría se
 * buscan en una sola tanda.
 */
export async function getServiceHistory(serviceId: string): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("historial_cambios")
    .select("id, tabla, accion, datos_anteriores, datos_nuevos, motivo, autor_nombre, created_at")
    .eq("servicio_id", serviceId)
    .order("id");

  if (error) throw new Error("No se pudo cargar el historial");
  const rows = data as HistoryRow[];

  const ids = { units: new Set<string>(), suppliers: new Set<string>(), categories: new Set<string>() };
  for (const row of rows) {
    for (const value of [asRow(row.datos_anteriores), asRow(row.datos_nuevos)]) {
      if (value.unidad_id) ids.units.add(str(value.unidad_id));
      if (value.proveedor_id) ids.suppliers.add(str(value.proveedor_id));
      if (value.categoria_id) ids.categories.add(str(value.categoria_id));
    }
  }

  const [units, suppliers, categories] = await Promise.all([
    ids.units.size
      ? supabase.from("unidades").select("id, numero_economico").in("id", [...ids.units])
      : Promise.resolve({ data: [] as { id: string; numero_economico: string }[] }),
    ids.suppliers.size
      ? supabase.from("proveedores").select("id, nombre").in("id", [...ids.suppliers])
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    ids.categories.size
      ? supabase.from("categorias").select("id, nombre").in("id", [...ids.categories])
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);

  const names: Names = {
    units: new Map((units.data ?? []).map((u) => [u.id, u.numero_economico])),
    suppliers: new Map((suppliers.data ?? []).map((s) => [s.id, s.nombre])),
    categories: new Map((categories.data ?? []).map((c) => [c.id, c.nombre])),
  };

  const entries: HistoryEntry[] = [];
  for (const row of rows) {
    const change = toChange(row, names);
    if (!change) continue;
    const last = entries.at(-1);
    if (last && last.at === row.created_at && last.reason === row.motivo) {
      last.changes.push(change);
    } else {
      entries.push({ at: row.created_at, author: row.autor_nombre ?? "Usuario", reason: row.motivo, changes: [change] });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Inicio: pendientes y últimos servicios
// ---------------------------------------------------------------------------

const BRIEF_COLUMNS =
  "id, fecha, total::text, num_comprobantes, autor_nombre, unidad:unidades!inner(numero_economico, tipo)";

type BriefRow = {
  id: string;
  fecha: string;
  total: string;
  num_comprobantes: number;
  autor_nombre: string | null;
  unidad: { numero_economico: string; tipo: UnitType };
};

const toBrief = (row: BriefRow): ServiceBrief => ({
  id: row.id,
  date: row.fecha,
  total: row.total,
  economicNumber: row.unidad.numero_economico,
  unitType: row.unidad.tipo,
  author: row.autor_nombre,
  receiptCount: row.num_comprobantes,
});

/**
 * Servicios sin factura, del más reciente al más viejo, y cuántos son en total.
 * RLS decide el alcance: el capturista solo ve los suyos.
 */
export async function listServicesWithoutReceipts(limit = 50): Promise<{ services: ServiceBrief[]; total: number }> {
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("servicios_resumen")
    .select(BRIEF_COLUMNS, { count: "exact" })
    .eq("num_comprobantes", 0)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<BriefRow[]>();

  if (error) throw new Error("No se pudieron cargar los servicios sin factura");
  return { services: data.map(toBrief), total: count ?? 0 };
}

/** Los últimos servicios capturados (por momento de captura). RLS: el capturista, los suyos. */
export async function listRecentServices(limit = 5): Promise<ServiceBrief[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("servicios_resumen")
    .select(BRIEF_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<BriefRow[]>();

  if (error) throw new Error("No se pudieron cargar los últimos servicios");
  return data.map(toBrief);
}
