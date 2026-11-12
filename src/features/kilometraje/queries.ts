import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CAPTURE_DAYS, toLastMileage } from "@/lib/utils/mileage";

import type { ReadingChange, UnitReading, WeeklyMileageRow } from "./types";

/**
 * Unidades activas con odómetro, con su kilometraje actual y la lectura de esta
 * semana (5H, D15). Mismo orden que la lista de Unidades. Los tres roles la ven.
 */
export async function getWeeklyMileage(): Promise<WeeklyMileageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lecturas_semana");
  if (error) throw new Error("No se pudo cargar el kilometraje de la semana");

  return data.map((row) => ({
    unitId: row.unidad_id,
    economicNumber: row.numero_economico,
    operation: row.operacion,
    last: toLastMileage({ kilometraje: row.kilometraje, fecha: row.kilometraje_fecha, fuente: row.kilometraje_fuente }),
    reading:
      row.lectura_id && row.lectura_kilometraje !== null && row.lectura_created_at
        ? {
            id: row.lectura_id,
            km: row.lectura_kilometraje,
            author: row.lectura_autor,
            createdBy: row.lectura_created_by,
            createdAt: row.lectura_created_at,
          }
        : null,
  }));
}

/** Lecturas de la ficha por tanda (las más recientes primero). */
export const UNIT_READINGS_BATCH_SIZE = 10;

type ChangeRow = {
  id: string;
  lectura_id: string;
  accion: string;
  semana: string;
  kilometraje_anterior: number;
  kilometraje_nuevo: number | null;
  motivo: string | null;
  autor_nombre: string | null;
  created_at: string;
};

const CHANGE_COLUMNS =
  "id, lectura_id, accion, semana, kilometraje_anterior, kilometraje_nuevo, motivo, autor_nombre, created_at";

const toChange = (c: ChangeRow): ReadingChange => ({
  id: c.id,
  readingId: c.lectura_id,
  action: c.accion === "quitada" ? "quitada" : "corregida",
  week: c.semana,
  previousKm: c.kilometraje_anterior,
  newKm: c.kilometraje_nuevo,
  reason: c.motivo,
  author: c.autor_nombre,
  createdAt: c.created_at,
});

/** Lecturas semanales de una unidad (ficha), con sus correcciones. */
export async function listUnitReadings(
  unitId: string,
  offset = 0,
): Promise<{ readings: UnitReading[]; total: number }> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("lecturas_kilometraje")
    .select("id, semana, fecha, kilometraje, autor_nombre, created_by, created_at", { count: "exact" })
    .eq("unidad_id", unitId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + UNIT_READINGS_BATCH_SIZE - 1);
  if (error) throw new Error("No se pudieron cargar las lecturas de la unidad");

  const ids = data.map((r) => r.id);
  let changes: ReadingChange[] = [];
  if (ids.length > 0) {
    const result = await supabase
      .from("cambios_lecturas_kilometraje")
      .select(CHANGE_COLUMNS)
      .in("lectura_id", ids)
      .order("created_at", { ascending: true });
    if (result.error) throw new Error("No se pudieron cargar las correcciones de las lecturas");
    changes = result.data.map(toChange);
  }

  return {
    total: count ?? data.length,
    readings: data.map((r) => ({
      id: r.id,
      week: r.semana,
      date: r.fecha,
      km: r.kilometraje,
      author: r.autor_nombre,
      createdBy: r.created_by,
      createdAt: r.created_at,
      changes: changes.filter((c) => c.readingId === r.id),
    })),
  };
}

/** Lecturas quitadas de una unidad (las más recientes), para la ficha. */
export async function listRemovedReadings(unitId: string): Promise<ReadingChange[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cambios_lecturas_kilometraje")
    .select(CHANGE_COLUMNS)
    .eq("unidad_id", unitId)
    .eq("accion", "quitada")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error("No se pudieron cargar las lecturas quitadas");
  return data.map(toChange);
}

/** Días de la semana en que el capturista registra (los elige el admin). */
export async function getCaptureDays(): Promise<number[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ajustes_kilometraje").select("dias_captura").eq("id", 1).maybeSingle();
  if (error) throw new Error("No se pudieron cargar los días de registro del kilometraje");
  return data?.dias_captura && data.dias_captura.length > 0 ? data.dias_captura : DEFAULT_CAPTURE_DAYS;
}
