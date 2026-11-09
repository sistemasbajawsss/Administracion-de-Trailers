import "server-only";

import { isRetired } from "@/features/unidades/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

import {
  MAINTENANCE_STATUS_ORDER,
  type FleetMaintenance,
  type Maintenance,
  type MaintenanceSource,
  type MaintenanceStatus,
} from "./types";

type PendingRow = Database["public"]["Functions"]["mantenimientos_pendientes"]["Returns"][number];

const toMaintenance = (m: PendingRow): Maintenance => ({
  id: m.id,
  unitId: m.unidad_id,
  name: m.nombre,
  everyKm: m.cada_km,
  everyMonths: m.cada_meses,
  lastDate: m.ultima_fecha,
  lastKm: m.ultimo_km,
  lastServiceId: m.ultimo_servicio_id,
  currentKm: m.km_actual,
  nextKm: m.proximo_km,
  nextDate: m.proxima_fecha,
  kmLeft: m.faltan_km,
  daysLeft: m.faltan_dias,
  status: m.estado as MaintenanceStatus,
});

const byUrgency = (a: Maintenance, b: Maintenance) =>
  MAINTENANCE_STATUS_ORDER[a.status] - MAINTENANCE_STATUS_ORDER[b.status] || a.name.localeCompare(b.name, "es");

/**
 * Mantenimientos activos de una unidad con lo que les falta (mantenimientos_pendientes:
 * el cálculo se hace en Postgres). Lo urgente primero.
 */
export async function listUnitMaintenance(unitId: string): Promise<Maintenance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mantenimientos_pendientes", { p_unidad_id: unitId });
  if (error) throw new Error("No se pudieron cargar los mantenimientos");
  return data.map(toMaintenance).sort(byUrgency);
}

/**
 * Lo pendiente de toda la flotilla (página Mantenimientos, formulario de servicio).
 * Sin las unidades de baja o vendidas. Ordenado por unidad (como la lista de
 * unidades) y, dentro de cada una, lo urgente primero.
 */
export async function listFleetMaintenance(): Promise<FleetMaintenance[]> {
  const supabase = await createClient();
  const [pending, units] = await Promise.all([
    supabase.rpc("mantenimientos_pendientes"),
    // Mismo orden que la lista de unidades: por tipo (orden del enum) y número.
    supabase.from("unidades").select("id, numero_economico, tipo, estatus").order("tipo").order("numero_orden"),
  ]);
  if (pending.error || units.error) throw new Error("No se pudieron cargar los mantenimientos");

  const unitById = new Map(units.data.map((u, index) => [u.id, { ...u, index }]));

  return pending.data
    .flatMap((row) => {
      const unit = unitById.get(row.unidad_id);
      if (!unit || isRetired(unit.estatus)) return [];
      const item: FleetMaintenance = { ...toMaintenance(row), economicNumber: unit.numero_economico, unitType: unit.tipo };
      return [{ item, order: unit.index }];
    })
    .sort((a, b) => a.order - b.order || byUrgency(a.item, b.item))
    .map(({ item }) => item);
}

/** Lo programado de cada unidad, para el "¿Cuenta como…?" del formulario de servicio. */
export async function listMaintenanceByUnit(): Promise<Record<string, Maintenance[]>> {
  const byUnit: Record<string, Maintenance[]> = {};
  for (const item of await listFleetMaintenance()) (byUnit[item.unitId] ??= []).push(item);
  return byUnit;
}

/** Unidades con mantenimientos activos, para "Copiar de otra unidad" (menos la propia). */
export async function listMaintenanceSources(exceptUnitId: string): Promise<MaintenanceSource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mantenimientos_unidad")
    .select("unidad_id, unidad:unidades!inner(numero_economico, numero_orden, tipo)")
    .eq("activo", true)
    .neq("unidad_id", exceptUnitId);
  if (error) throw new Error("No se pudieron cargar las unidades con mantenimientos");

  const byUnit = new Map<string, MaintenanceSource & { order: string }>();
  for (const row of data) {
    const current = byUnit.get(row.unidad_id);
    if (current) current.count += 1;
    else
      byUnit.set(row.unidad_id, {
        unitId: row.unidad_id,
        economicNumber: row.unidad.numero_economico,
        count: 1,
        order: `${row.unidad.tipo}-${String(row.unidad.numero_orden ?? 0).padStart(6, "0")}`,
      });
  }
  return [...byUnit.values()]
    .sort((a, b) => a.order.localeCompare(b.order))
    .map(({ unitId, economicNumber, count }) => ({ unitId, economicNumber, count }));
}
