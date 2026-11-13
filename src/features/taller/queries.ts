import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { ShopEntry } from "./types";

/**
 * Unidades en taller ahora (entradas abiertas). Primero las que aprobó un
 * administrador con un ticket (5H: tienen prioridad, pedido del usuario); luego
 * la que lleva más días.
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

  const approvals = await listAdminApprovalsByEntry(data.map((row) => row.id));

  const entries = data.map((row) => ({
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
    approval: approvals.get(row.id) ?? null,
  }));
  // Orden estable: las aprobadas por admin primero, cada grupo como venía.
  return [...entries.filter((e) => e.approval), ...entries.filter((e) => !e.approval)];
}

/** Estancias abiertas que vinieron de un ticket aprobado por un admin (5H), por entrada. */
export async function listAdminApprovalsByEntry(entryIds: string[]): Promise<Map<string, { approverName: string | null; reason: string | null }>> {
  if (entryIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets_taller")
    .select("entrada_id, atendido_nombre, motivo_aprobacion")
    .in("entrada_id", entryIds)
    .eq("atendido_por_admin", true);
  if (error) throw new Error("No se pudieron revisar los tickets aprobados");
  return new Map(data.filter((t) => t.entrada_id).map((t) => [t.entrada_id!, { approverName: t.atendido_nombre, reason: t.motivo_aprobacion }]));
}
