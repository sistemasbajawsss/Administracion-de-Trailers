import { ChevronRight, DoorOpen } from "lucide-react";
import Link from "next/link";

import { formatDate, formatMoney } from "@/lib/utils/format";

import type { UnitShopStay } from "../types";

/** Días completos entre dos fechas "aaaa-mm-dd" (sin zonas horarias). */
function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000));
}

const dayLabel = (days: number) => (days === 0 ? "el mismo día" : days === 1 ? "1 día" : `${days} días`);
const serviceLabel = (n: number) => (n === 0 ? "sin servicios" : n === 1 ? "1 servicio" : `${n} servicios`);

/**
 * Estancias en taller de la unidad (ficha; admin y gerente, 5E). Cada una es una
 * tarjeta con todo a la vista (el usuario no quiere tocar para abrir ni textos
 * cortados con "…"): fechas, días, falla, lo gastado, sus servicios (cada uno
 * lleva a su detalle) y cuál la sacó de taller. La que sigue en taller va en ámbar.
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

      <ol className="space-y-3">
        {stays.map((stay) => {
          const open = stay.exitDate === null;
          const days = daysBetween(stay.entryDate, stay.exitDate ?? today);
          return (
            <li key={stay.id} className={`rounded-xl border bg-white ${open ? "border-amber-300" : ""}`}>
              <div className="flex items-start gap-3 px-4 pt-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular-nums">
                    {formatDate(stay.entryDate)}
                    {" → "}
                    {open ? <span className="text-amber-800">sigue en taller</span> : formatDate(stay.exitDate!)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {open ? `Lleva ${dayLabel(days)}` : `Estuvo ${dayLabel(days)}`} · {serviceLabel(stay.serviceCount)}
                  </p>
                </div>
                <p className="shrink-0 font-heading text-lg font-semibold whitespace-nowrap tabular-nums">
                  {formatMoney(stay.total)}
                </p>
              </div>

              <p className="mt-2 px-4 whitespace-pre-line sm:px-5">
                <span className="text-sm text-muted-foreground">Falla: </span>
                {stay.fault}
              </p>

              {stay.services.length > 0 && (
                <ul className="mt-2 divide-y border-t px-4 sm:px-5">
                  {stay.services.map((service) => {
                    const releasedIt = service.id === stay.exitServiceId;
                    return (
                      <li key={service.id}>
                        <Link
                          href={`/servicios/${service.id}`}
                          className="flex min-h-12 items-start gap-3 py-2 outline-none hover:bg-muted/50 focus-visible:bg-muted"
                        >
                          <span className="w-12 shrink-0 pt-0.5 text-sm tabular-nums">{formatDate(service.date).slice(0, 5)}</span>
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="block">{service.supplier ?? "Sin proveedor"}</span>
                            {service.description && (
                              <span className="block whitespace-pre-line text-muted-foreground">{service.description}</span>
                            )}
                            {releasedIt && (
                              <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-[#3d6b1c]">
                                <DoorOpen className="size-3.5 shrink-0" aria-hidden="true" />
                                Salió de taller con este servicio
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 pt-0.5 font-semibold whitespace-nowrap tabular-nums">{formatMoney(service.total)}</span>
                          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
                {[
                  stay.services.length === 0 && "No se registraron servicios en esta estancia",
                  stay.reportedBy && `Reportó ${stay.reportedBy}`,
                  // La nota automática del servicio ya se ve arriba como "Salió de taller con este servicio".
                  !stay.exitServiceId && stay.exitNote && `Salida: ${stay.exitNote}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
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
