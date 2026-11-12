"use client";

import { ChevronDown, ChevronRight, DoorOpen, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PRIORITY_LABELS } from "@/features/tickets/types";
import { formatDate, formatDateTime, formatElapsed, formatMoney } from "@/lib/utils/format";
import { useToday } from "@/components/shared/use-today";

import { loadMoreShopStays } from "../actions";
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
 * tarjeta desplegable que aparece cerrada (fechas, días, falla y lo gastado) y se
 * abre al tocarla (sus servicios, cada uno lleva a su detalle, y cuál la sacó de
 * taller). Van en un cuadro con su propio scroll (unas 10 a la vista, máximo 60 %
 * de la pantalla) y cargan por tandas dentro del cuadro, para que con muchas se
 * pueda llegar a lo que sigue en la ficha (pedido del usuario, 2026-11-10).
 */
export function ShopStays({
  unitId,
  initialStays,
  total,
  batchSize,
  today: serverToday,
}: {
  unitId: string;
  initialStays: UnitShopStay[];
  total: number;
  batchSize: number;
  today: string;
}) {
  const today = useToday(serverToday);
  const [stays, setStays] = useState(initialStays);
  const [done, setDone] = useState(initialStays.length >= total || initialStays.length < batchSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadMoreShopStays(unitId, stays.length);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStays((current) => {
        const seen = new Set(current.map((stay) => stay.id));
        return [...current, ...result.data.filter((stay) => !seen.has(stay.id))];
      });
      if (result.data.length < batchSize) setDone(true);
    } catch {
      setError("No se pudo conectar. Revisa tu internet.");
    } finally {
      setLoading(false);
    }
  }, [loading, done, unitId, stays.length, batchSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    // Con error no se vigila (evita pedir en bucle sin señal); se reintenta con el botón.
    if (!sentinel || done || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root: boxRef.current, rootMargin: "0px 0px 400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, done, error]);

  if (total === 0) return null;

  return (
    <section aria-labelledby="estancias-taller" className="mb-10">
      <h2 id="estancias-taller" className="mb-1 text-2xl font-semibold">
        En taller
        <span className="ml-2 text-base font-normal text-muted-foreground">
          {total} {total === 1 ? "vez" : "veces"}
        </span>
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">Toca una para ver sus servicios.</p>

      <div
        ref={boxRef}
        role="region"
        aria-label="Estancias en taller"
        tabIndex={0}
        className="max-h-[min(44rem,60dvh)] overflow-y-auto rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
      <ol className="space-y-3">
        {stays.map((stay) => {
          const open = stay.exitDate === null;
          const days = daysBetween(stay.entryDate, stay.exitDate ?? today);
          return (
            <li key={stay.id}>
              <details className={`group rounded-xl border bg-white ${open ? "border-amber-300" : ""}`}>
                <summary className="flex min-h-14 cursor-pointer list-none items-start gap-3 rounded-xl px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium tabular-nums">
                      {formatDate(stay.entryDate)}
                      {" → "}
                      {open ? <span className="text-amber-800">sigue en taller</span> : formatDate(stay.exitDate!)}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {open ? `Lleva ${dayLabel(days)}` : `Estuvo ${dayLabel(days)}`} · {serviceLabel(stay.serviceCount)}
                    </span>
                    <span className="mt-1 block whitespace-pre-line">{stay.fault}</span>
                    {stay.ticket?.attendedAt && (
                      <span className="mt-1 block text-sm text-muted-foreground">
                        Ticket {stay.ticket.folio} ({PRIORITY_LABELS[stay.ticket.priority]}), lo aceptaron en{" "}
                        <span className="font-medium text-foreground">{formatElapsed(stay.ticket.createdAt, stay.ticket.attendedAt)}</span>
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-heading text-lg font-semibold whitespace-nowrap tabular-nums">{formatMoney(stay.total)}</span>
                    <ChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                  </span>
                </summary>

                <div className="border-t px-4 pb-3 sm:px-5">
                  {stay.services.length === 0 ? (
                    <p className="pt-3 text-sm text-muted-foreground">No se registraron servicios en esta estancia.</p>
                  ) : (
                    <ul className="divide-y">
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
                              <span className="shrink-0 pt-0.5 font-semibold whitespace-nowrap tabular-nums">
                                {formatMoney(service.total)}
                              </span>
                              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {(stay.ticket || stay.reportedBy || (!stay.exitServiceId && stay.exitNote)) && (
                    <p className="pt-2 text-sm text-muted-foreground">
                      {[
                        stay.ticket
                          ? `Ticket levantado por ${stay.ticket.creatorName ?? "alguien"} el ${formatDateTime(stay.ticket.createdAt)}${stay.ticket.attendedAt ? `, aceptado por ${stay.ticket.attendedName ?? "un capturista"} el ${formatDateTime(stay.ticket.attendedAt)}` : ""}`
                          : stay.reportedBy && `Reportó ${stay.reportedBy}`,
                        // La nota automática del servicio ya se ve como "Salió de taller con este servicio".
                        !stay.exitServiceId && stay.exitNote && `Salida: ${stay.exitNote}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>

      <div ref={sentinelRef} className="py-3 text-center text-sm text-muted-foreground" aria-live="polite">
        {loading && (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Cargando más estancias…
          </span>
        )}
        {error && (
          <button type="button" onClick={() => void loadMore()} className="min-h-11 font-medium text-destructive underline underline-offset-2">
            {error} Toca para reintentar.
          </button>
        )}
      </div>
      </div>
    </section>
  );
}
