import "server-only";

import { createClient } from "@/lib/supabase/server";

import { MAINTENANCE_STATUS_ORDER, type Maintenance, type MaintenanceSource, type MaintenanceStatus } from "./types";

/**
 * Mantenimientos activos de una unidad con lo que les falta (mantenimientos_pendientes:
 * el cálculo se hace en Postgres). Lo urgente primero.
 */
export async function listUnitMaintenance(unitId: string): Promise<Maintenance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mantenimientos_pendientes", { p_unidad_id: unitId });
  if (error) throw new Error("No se pudieron cargar los mantenimientos");

  return data
    .map(
      (m): Maintenance => ({
        id: m.id,
        unitId: m.unidad_id,
        name: m.nombre,
        everyKm: m.cada_km,
        everyMonths: m.cada_meses,
        lastDate: m.desde_fecha,
        lastKm: m.desde_km,
        currentKm: m.km_actual,
        nextKm: m.proximo_km,
        nextDate: m.proxima_fecha,
        kmLeft: m.faltan_km,
        daysLeft: m.faltan_dias,
        status: m.estado as MaintenanceStatus,
      }),
    )
    .sort(
      (a, b) =>
        MAINTENANCE_STATUS_ORDER[a.status] - MAINTENANCE_STATUS_ORDER[b.status] || a.name.localeCompare(b.name, "es"),
    );
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
