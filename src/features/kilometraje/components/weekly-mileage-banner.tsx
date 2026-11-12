import { Gauge } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { todayInTijuana } from "@/lib/utils/format";
import { describeCaptureDays, isLastCaptureDay, isWeeklyCaptureDay, nextCaptureDate, weekdayName } from "@/lib/utils/mileage";

import { getCaptureDays, getWeeklyMileage } from "../queries";

/**
 * Tarjeta roja "Actualizar kilometraje" del Inicio (5H, D15): en los días de registro,
 * mientras falten unidades por registrar. Solo para quien puede capturar
 * (admin y capturista); el gerente no la ve.
 */
export async function WeeklyMileageBanner() {
  const today = todayInTijuana();
  const days = await getCaptureDays();
  if (!isWeeklyCaptureDay(today, days)) return null;

  const rows = await getWeeklyMileage();
  const pending = rows.filter((r) => !r.reading).length;
  if (pending === 0) return null;

  const last = isLastCaptureDay(today, days);
  const next = nextCaptureDate(today, days);

  return (
    <section
      aria-labelledby="actualizar-km"
      className="mb-6 flex min-w-0 flex-col gap-4 rounded-xl border border-red-500/40 border-l-4 border-l-red-600 bg-red-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Gauge className="mt-0.5 size-6 shrink-0 text-red-700" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="actualizar-km" className="font-heading text-xl font-semibold text-red-900">
            Actualizar kilometraje
          </h2>
          <p className="text-red-900">
            Faltan <span className="font-semibold tabular-nums">{pending}</span> de{" "}
            <span className="tabular-nums">{rows.length}</span> unidades.{" "}
            {last
              ? `Hoy es el último día para registrarlo (se registra ${describeCaptureDays(days)}).`
              : `Se registra hoy y el ${weekdayName(next)}.`}
          </p>
        </div>
      </div>
      <Link href="/kilometraje" className={cn(buttonVariants({ size: "touch" }), "shrink-0 bg-red-700 text-white hover:bg-red-800")}>
        Registrar kilometraje
      </Link>
    </section>
  );
}
