import { Gauge } from "lucide-react";
import Link from "next/link";

import { todayInTijuana } from "@/lib/utils/format";
import { isLastCaptureDay, isWeeklyCaptureDay, nextCaptureDate, weekdayName } from "@/lib/utils/mileage";

import { getCaptureDays, getWeeklyMileage } from "../queries";

/**
 * Tarjeta roja "Actualizar kilometraje" del Inicio (5H, D15): en los días de
 * registro, mientras falten unidades. Solo para quien puede capturar (admin y
 * capturista); el gerente no la ve. Un solo renglón (pedido del usuario,
 * 2026-11-12) para que la cuadrícula del Inicio siga cabiendo en la pantalla.
 */
export async function WeeklyMileageBanner() {
  const today = todayInTijuana();
  const days = await getCaptureDays();
  if (!isWeeklyCaptureDay(today, days)) return null;

  const rows = await getWeeklyMileage();
  const pending = rows.filter((r) => !r.reading).length;
  if (pending === 0) return null;

  const when = isLastCaptureDay(today, days) ? "hoy es el último día" : `también el ${weekdayName(nextCaptureDate(today, days))}`;

  return (
    <section
      aria-label="Actualizar kilometraje"
      className="mb-6 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-red-500/40 border-l-4 border-l-red-600 bg-red-50 px-4 py-2"
    >
      <Gauge className="size-6 shrink-0 text-red-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-base text-red-950">
        <span className="font-bold">Actualizar kilometraje:</span> faltan{" "}
        <span className="font-bold tabular-nums">{pending}</span> de <span className="tabular-nums">{rows.length}</span>{" "}
        unidades, {when}.
      </p>
      <Link
        href="/kilometraje"
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-red-700 px-4 text-base font-semibold text-white outline-none hover:bg-red-800 focus-visible:ring-3 focus-visible:ring-red-700/40"
      >
        Registrar
      </Link>
    </section>
  );
}
