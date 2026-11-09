import "server-only";

import type { UnitType } from "@/features/unidades/types";
import { createClient } from "@/lib/supabase/server";
import { toLastMileage, type LastMileage } from "@/lib/utils/mileage";

import type { ShopEntry } from "./types";

/**
 * Lo que el servidor necesita para validar el kilometraje de una entrada (5F): el
 * tipo de unidad (las cajas no llevan) y su última lectura.
 */
export async function getUnitMileageRule(unitId: string): Promise<{ type: UnitType; last: LastMileage | null } | null> {
  const supabase = await createClient();
  const [unit, mileage] = await Promise.all([
    supabase.from("unidades").select("tipo").eq("id", unitId).maybeSingle(),
    supabase.rpc("kilometraje_unidades", { p_unidad_id: unitId }),
  ]);
  if (unit.error || mileage.error) throw new Error("No se pudo revisar el kilometraje de la unidad");
  if (!unit.data) return null;
  const row = mileage.data[0];
  return { type: unit.data.tipo, last: row ? toLastMileage(row) : null };
}

/**
 * Unidades en taller ahora (entradas abiertas), la que lleva más días primero.
 * Una sola consulta con la unidad anidada; son pocas (una por unidad como máximo).
 */
export async function listOpenShopEntries(): Promise<ShopEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entradas_taller")
    // servicios(count): cuántos servicios lleva la estancia (RLS: el capturista cuenta los suyos).
    .select("id, unidad_id, fecha_entrada, falla, reporta_nombre, unidad:unidades!inner(numero_economico, tipo, operacion), servicios(count)")
    .is("fecha_salida", null)
    .order("fecha_entrada", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error("No se pudieron cargar las unidades en taller");

  return data.map((row) => ({
    id: row.id,
    unitId: row.unidad_id,
    economicNumber: row.unidad.numero_economico,
    unitType: row.unidad.tipo,
    unitOperation: row.unidad.operacion,
    entryDate: row.fecha_entrada,
    fault: row.falla,
    reportedBy: row.reporta_nombre,
    serviceCount: row.servicios[0]?.count ?? 0,
  }));
}
