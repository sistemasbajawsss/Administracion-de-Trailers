import { formatDate } from "@/lib/utils/format";

import type { UnitShopStay } from "../types";

/** Días completos entre dos fechas "aaaa-mm-dd" (sin zonas horarias). */
function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000));
}

const dayLabel = (days: number) => (days === 0 ? "el mismo día" : days === 1 ? "1 día" : `${days} días`);

/**
 * Estancias en taller de la unidad (ficha; admin y gerente, 5E): cuándo entró y
 * salió, cuántos días estuvo, la falla y cuántos servicios se le registraron.
 */
export function ShopStays({ stays, total, today }: { stays: UnitShopStay[]; total: number; today: string }) {
  if (total === 0) return null;

  return (
    <section aria-labelledby="estancias-taller" className="mb-10">
      <h2 id="estancias-taller" className="mb-4 text-2xl font-semibold">
        En taller
        <span className="ml-2 text-base font-normal text-muted-foreground">
          {total} {total === 1 ? "vez" : "veces"}
        </span>
      </h2>
      <ol className="divide-y rounded-xl border bg-white">
        {stays.map((stay) => {
          const open = stay.exitDate === null;
          const days = daysBetween(stay.entryDate, stay.exitDate ?? today);
          return (
            <li key={stay.id} className="grid grid-cols-1 gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-baseline sm:px-5">
              <p className="tabular-nums">
                <span className="font-medium">{formatDate(stay.entryDate)}</span>
                {" → "}
                {open ? <span className="font-medium text-amber-800">sigue en taller</span> : formatDate(stay.exitDate!)}
                <span className="block text-sm text-muted-foreground">
                  {open ? `Lleva ${dayLabel(days)}` : `Estuvo ${dayLabel(days)}`}
                </span>
              </p>
              <div className="min-w-0">
                <p className="whitespace-pre-line">{stay.fault}</p>
                {(stay.exitNote || stay.reportedBy) && (
                  <p className="text-sm text-muted-foreground">
                    {[stay.reportedBy && `Reportó ${stay.reportedBy}`, stay.exitNote].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <p className="text-sm whitespace-nowrap text-muted-foreground sm:text-right">
                {stay.serviceCount === 0
                  ? "Sin servicios"
                  : `${stay.serviceCount} ${stay.serviceCount === 1 ? "servicio" : "servicios"}`}
              </p>
            </li>
          );
        })}
      </ol>
      {total > stays.length && (
        <p className="mt-2 text-sm text-muted-foreground">Se muestran las {stays.length} más recientes de {total}.</p>
      )}
    </section>
  );
}
