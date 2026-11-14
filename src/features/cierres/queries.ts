import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todayInTijuana } from "@/lib/utils/format";
import type { MonthLock } from "@/lib/utils/month-lock";

import type { MonthCloseRow } from "./types";

/** Qué meses pasados siguen abiertos y el día de cierre (los tres roles). */
export async function getMonthLock(): Promise<MonthLock> {
  const supabase = await createClient();
  const [open, day] = await Promise.all([supabase.rpc("meses_abiertos"), supabase.rpc("dia_cierre")]);
  if (open.error || day.error) throw new Error("No se pudo revisar el cierre de mes");
  return { today: todayInTijuana(), openMonths: open.data.map((m) => m.slice(0, 10)), closeDay: day.data };
}

/** Estado de los últimos 12 meses (admin y gerente). */
export async function listMonthCloses(): Promise<MonthCloseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("meses_cierre", { p_meses: 12 });
  if (error) throw new Error("No se pudo cargar el cierre de mes");
  return data.map((row) => ({
    month: row.mes,
    current: row.en_curso,
    closed: row.cerrado,
    closesOn: row.cierra_solo,
    lastAction: row.ultima_accion === "cerrar" || row.ultima_accion === "reabrir" ? row.ultima_accion : null,
    by: row.por,
    at: row.at,
    reason: row.motivo,
  }));
}
