import "server-only";

import { isRetired } from "@/features/unidades/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

import {
  byUrgency,
  type FleetMaintenance,
  type Maintenance,
  type MaintenanceTarget,
  type MaintenanceStatus,
  type MaintenanceWarnings,
  type UnitWarningInfo,
} from "./types";

type PendingRow = Database["public"]["Functions"]["mantenimientos_estado"]["Returns"][number];

/** Aviso general si la fila no se pudiera leer (el mismo valor por omisión que la BD). */
const DEFAULT_WARNING_KM = 4000;

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
  warningKm: m.aviso_km,
  ownWarning: m.aviso_propio,
});

/**
 * Mantenimientos activos de una unidad con lo que les falta (mantenimientos_estado:
 * el cálculo se hace en Postgres). Lo urgente primero.
 */
export async function listUnitMaintenance(unitId: string): Promise<Maintenance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mantenimientos_estado", { p_unidad_id: unitId });
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
    supabase.rpc("mantenimientos_estado"),
    // Mismo orden que la lista de unidades: por tipo (orden del catálogo) y número.
    supabase
      .from("unidades")
      .select("id, numero_economico, estatus, operacion, tipo_info:tipos_unidad(nombre)")
      .order("orden_tipo")
      .order("numero_orden"),
  ]);
  if (pending.error || units.error) throw new Error("No se pudieron cargar los mantenimientos");

  const unitById = new Map(units.data.map((u, index) => [u.id, { ...u, index }]));

  return pending.data
    .flatMap((row) => {
      const unit = unitById.get(row.unidad_id);
      if (!unit || isRetired(unit.estatus)) return [];
      const item: FleetMaintenance = {
        ...toMaintenance(row),
        economicNumber: unit.numero_economico,
        unitTypeName: unit.tipo_info?.nombre ?? "",
        operation: unit.operacion,
      };
      return [{ item, order: unit.index }];
    })
    .sort((a, b) => a.order - b.order || byUrgency(a.item, b.item))
    .map(({ item }) => item);
}

/**
 * Aviso de kilometraje (5J): el general, las unidades con aviso propio (en el
 * orden de la lista de unidades) y a cuáles se les puede poner. Los tres roles
 * leen; solo el admin cambia (funciones de la BD).
 */
export async function getMaintenanceWarnings(): Promise<MaintenanceWarnings> {
  const supabase = await createClient();
  const [general, own, units] = await Promise.all([
    supabase.from("ajustes_mantenimiento").select("aviso_km").eq("id", 1).maybeSingle(),
    supabase.from("avisos_mantenimiento_unidad").select("unidad_id, aviso_km"),
    supabase
      .from("unidades")
      .select("id, numero_economico, tipo, operacion, estatus, tipo_info:tipos_unidad(nombre, lleva_kilometraje)")
      .order("orden_tipo")
      .order("numero_orden"),
  ]);
  if (general.error || own.error || units.error) throw new Error("No se pudo cargar el aviso de kilometraje");

  const ownKm = new Map(own.data.map((a) => [a.unidad_id, a.aviso_km]));
  const targets: MaintenanceTarget[] = units.data
    .filter((u) => !isRetired(u.estatus) && (u.tipo_info?.lleva_kilometraje ?? true))
    .map((u) => ({
      id: u.id,
      economicNumber: u.numero_economico,
      typeName: u.tipo_info?.nombre ?? u.tipo,
      operation: u.operacion,
      hasOdometer: true,
      hasKm: true,
    }));

  return {
    generalKm: general.data?.aviso_km ?? DEFAULT_WARNING_KM,
    units: targets
      .filter((t) => ownKm.has(t.id))
      .map((t) => ({ unitId: t.id, economicNumber: t.economicNumber, typeName: t.typeName, km: ownKm.get(t.id)! })),
    targets,
  };
}

/** El aviso de km que usa una unidad (ficha): el propio si tiene, si no el general. */
export async function getUnitWarning(unitId: string): Promise<UnitWarningInfo> {
  const supabase = await createClient();
  const [general, own] = await Promise.all([
    supabase.from("ajustes_mantenimiento").select("aviso_km").eq("id", 1).maybeSingle(),
    supabase.from("avisos_mantenimiento_unidad").select("aviso_km").eq("unidad_id", unitId).maybeSingle(),
  ]);
  if (general.error || own.error) throw new Error("No se pudo cargar el aviso de kilometraje");
  return own.data
    ? { km: own.data.aviso_km, own: true }
    : { km: general.data?.aviso_km ?? DEFAULT_WARNING_KM, own: false };
}

/** Lo programado de cada unidad, para el "¿Cuenta como…?" del formulario de servicio. */
export async function listMaintenanceByUnit(): Promise<Record<string, Maintenance[]>> {
  const byUnit: Record<string, Maintenance[]> = {};
  for (const item of await listFleetMaintenance()) (byUnit[item.unitId] ??= []).push(item);
  return byUnit;
}

/** Todas las demás unidades (menos las de baja o vendidas), para "Aplicar también a" al agregar uno. */
export async function listMaintenanceTargets(exceptUnitId: string): Promise<MaintenanceTarget[]> {
  const supabase = await createClient();
  const [units, mileage] = await Promise.all([
    supabase
      .from("unidades")
      .select("id, numero_economico, tipo, operacion, estatus, tipo_info:tipos_unidad(nombre, lleva_kilometraje)")
      .neq("id", exceptUnitId)
      .order("orden_tipo")
      .order("numero_orden"),
    supabase.rpc("kilometraje_unidades"),
  ]);
  if (units.error || mileage.error) throw new Error("No se pudieron cargar las unidades");

  const withKm = new Set(mileage.data.filter((k) => k.kilometraje !== null).map((k) => k.unidad_id));
  return units.data
    .filter((u) => !isRetired(u.estatus))
    .map((u) => ({
      id: u.id,
      economicNumber: u.numero_economico,
      typeName: u.tipo_info?.nombre ?? u.tipo,
      operation: u.operacion,
      hasOdometer: u.tipo_info?.lleva_kilometraje ?? true,
      hasKm: (u.tipo_info?.lleva_kilometraje ?? true) && withKm.has(u.id),
    }));
}
