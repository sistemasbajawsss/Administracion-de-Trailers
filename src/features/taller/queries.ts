import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { ShopEntry } from "./types";

/**
 * Unidades en taller ahora (entradas abiertas), la que lleva más días primero.
 * Una sola consulta con la unidad anidada; son pocas (una por unidad como máximo).
 */
export async function listOpenShopEntries(): Promise<ShopEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entradas_taller")
    // servicios(count): cuántos servicios lleva la estancia (RLS: el capturista cuenta los suyos).
    .select("id, unidad_id, fecha_entrada, falla, reporta_nombre, unidad:unidades!inner(numero_economico, tipo, operacion, tipo_info:tipos_unidad(nombre)), servicios(count)")
    .is("fecha_salida", null)
    .order("fecha_entrada", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error("No se pudieron cargar las unidades en taller");

  return data.map((row) => ({
    id: row.id,
    unitId: row.unidad_id,
    economicNumber: row.unidad.numero_economico,
    unitType: row.unidad.tipo,
    unitTypeName: row.unidad.tipo_info?.nombre ?? row.unidad.tipo,
    unitOperation: row.unidad.operacion,
    entryDate: row.fecha_entrada,
    fault: row.falla,
    reportedBy: row.reporta_nombre,
    serviceCount: row.servicios[0]?.count ?? 0,
  }));
}
