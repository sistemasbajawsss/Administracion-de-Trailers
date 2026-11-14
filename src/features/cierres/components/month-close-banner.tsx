import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { monthOnlyName, previousMonthStart } from "@/lib/utils/month-lock";

import { getMonthLock } from "../queries";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Renglón del Inicio del capturista (5I, D17): del día 1 al anterior al día de
 * cierre, mientras el mes pasado siga abierto. Un solo renglón, como el del
 * kilometraje, para que la cuadrícula del Inicio siga cabiendo.
 */
export async function MonthCloseBanner() {
  const lock = await getMonthLock();
  const previous = previousMonthStart(lock.today);
  const day = Number(lock.today.slice(8, 10));
  if (!lock.openMonths.includes(previous) || day >= lock.closeDay) return null;

  const name = capitalize(monthOnlyName(previous));
  const when = day === lock.closeDay - 1 ? "mañana" : `el día ${lock.closeDay}`;

  return (
    <section
      aria-label={`${name} se cierra pronto`}
      className="mb-6 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-500/40 border-l-4 border-l-amber-600 bg-amber-50 px-4 py-2"
    >
      <CalendarClock className="size-6 shrink-0 text-amber-800" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-base text-amber-950">
        <span className="font-bold">
          {name} se cierra {when}:
        </span>{" "}
        sube lo que falte. Después ya solo el administrador puede cambiarlo.
      </p>
      <Link
        href="/servicios/nuevo"
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-amber-700 px-4 text-base font-semibold text-white outline-none hover:bg-amber-800 focus-visible:ring-3 focus-visible:ring-amber-700/40"
      >
        Registrar
      </Link>
    </section>
  );
}
