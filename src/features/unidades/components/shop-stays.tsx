import { ChevronDown, ChevronRight, DoorOpen } from "lucide-react";
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
 * tarjeta que se abre: cerrada, fechas, días, falla y lo gastado; abierta, sus
 * servicios (cada uno lleva a su detalle) y cuál la sacó de taller. La que sigue
 * en taller va resaltada; la más reciente viene abierta.
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
        {stays.map((stay, index) => {
          const open = stay.exitDate === null;
          const days = daysBetween(stay.entryDate, stay.exitDate ?? today);
          return (
            <li key={stay.id}>
              <details
                open={index === 0}
                className={`group rounded-xl border bg-white ${open ? "border-amber-300" : ""}`}
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-start gap-3 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium tabular-nums">
                      {formatDate(stay.entryDate)}
                      {" → "}
                      {open ? <span className="text-amber-800">sigue en taller</span> : formatDate(stay.exitDate!)}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {open ? `Lleva ${dayLabel(days)}` : `Estuvo ${dayLabel(days)}`} · {serviceLabel(stay.serviceCount)}
                    </span>
                    <span className="mt-1 block truncate" title={stay.fault}>
                      {stay.fault}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-heading text-lg font-semibold whitespace-nowrap tabular-nums">{formatMoney(stay.total)}</span>
                    <ChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                  </span>
                </summary>

                <div className="border-t px-4 py-3 sm:px-5">
                  <p className="text-sm whitespace-pre-line">
                    <span className="text-muted-foreground">Falla: </span>
                    {stay.fault}
                  </p>

                  {stay.services.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">No se registraron servicios en esta estancia.</p>
                  ) : (
                    <ul className="mt-2 divide-y">
                      {stay.services.map((service) => {
                        const releasedIt = service.id === stay.exitServiceId;
                        return (
                          <li key={service.id}>
                            <Link
                              href={`/servicios/${service.id}`}
                              className="flex min-h-12 items-center gap-3 py-2 outline-none hover:bg-muted/50 focus-visible:bg-muted"
                            >
                              <span className="w-12 shrink-0 text-sm tabular-nums">{formatDate(service.date).slice(0, 5)}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm" title={service.supplier ?? undefined}>
                                  {service.supplier ?? "Sin proveedor"}
                                </span>
                                {service.description && (
                                  <span className="block truncate text-sm text-muted-foreground" title={service.description}>
                                    {service.description}
                                  </span>
                                )}
                                {releasedIt && (
                                  <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[#3d6b1c]">
                                    <DoorOpen className="size-3.5" aria-hidden="true" />
                                    Salió de taller con este servicio
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">{formatMoney(service.total)}</span>
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <p className="mt-2 text-sm text-muted-foreground">
                    {[
                      stay.reportedBy && `Reportó ${stay.reportedBy}`,
                      // La nota automática del servicio ya se ve arriba como "Salió de taller con este servicio".
                      !stay.exitServiceId && stay.exitNote && `Salida: ${stay.exitNote}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </details>
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
