"use client";

import { ChevronDown, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToday } from "@/components/shared/use-today";
import type { Role } from "@/lib/auth/types";
import { formatDate, formatDateTime, formatKm } from "@/lib/utils/format";
import { weekStart } from "@/lib/utils/mileage";

import { loadMoreUnitReadings } from "../actions";
import { readingPermission, type ReadingChange, type UnitReading } from "../types";
import { ReadingActions } from "./reading-actions";

/**
 * Lecturas semanales de la unidad en su ficha (5H, D15): tarjeta desplegable que
 * sale cerrada. Adentro, de la más reciente a la más vieja, con quién la registró
 * y sus correcciones; el admin las corrige o quita con motivo. Van en un cuadro
 * con su propio scroll (máximo 60 % de la pantalla) que carga por tandas, como
 * las estancias en taller.
 */
export function UnitReadings({
  unitId,
  economicNumber,
  initialReadings,
  total,
  batchSize,
  removed,
  user,
  canChange,
  today: serverToday,
}: {
  unitId: string;
  economicNumber: string;
  initialReadings: UnitReading[];
  total: number;
  batchSize: number;
  removed: ReadingChange[];
  user: { id: string; role: Role };
  /** La unidad sigue activa (de baja o vendida ya no se corrige). */
  canChange: boolean;
  today: string;
}) {
  const today = useToday(serverToday);
  const currentWeek = weekStart(today);
  const [readings, setReadings] = useState(initialReadings);
  const [done, setDone] = useState(initialReadings.length >= total || initialReadings.length < batchSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadMoreUnitReadings(unitId, readings.length);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReadings((current) => {
        const seen = new Set(current.map((r) => r.id));
        return [...current, ...result.data.filter((r) => !seen.has(r.id))];
      });
      if (result.data.length < batchSize) setDone(true);
    } catch {
      setError("No se pudo conectar. Revisa tu internet.");
    } finally {
      setLoading(false);
    }
  }, [loading, done, unitId, readings.length, batchSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    // Con error no se vigila (evita pedir en bucle); se reintenta con el botón.
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

  if (total === 0 && removed.length === 0) return null;
  const latest = initialReadings[0];

  return (
    <section aria-label="Lecturas semanales de kilometraje" className="mb-10">
      <details className="group rounded-xl border bg-white">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-semibold">
              Lecturas semanales
              <span className="ml-2 text-base font-normal text-muted-foreground tabular-nums">{total}</span>
            </span>
            {latest && (
              <span className="block text-sm text-muted-foreground">
                La más reciente: <span className="whitespace-nowrap">{formatKm(latest.km)}</span>, semana del{" "}
                {formatDate(latest.week)}
              </span>
            )}
          </span>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="border-t px-4 py-3 sm:px-5">
          {readings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tiene lecturas semanales.</p>
          ) : (
            <div
              ref={boxRef}
              role="region"
              aria-label="Lecturas de cada semana"
              tabIndex={0}
              className="max-h-[min(40rem,60dvh)] overflow-y-auto rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ol className="divide-y">
                {readings.map((reading) => {
                  const permission = canChange ? readingPermission(reading, user, today) : null;
                  return (
                    <li key={reading.id} className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium tabular-nums">
                          <span className="whitespace-nowrap">Semana del {formatDate(reading.week)}:</span>{" "}
                          <span className="whitespace-nowrap">{formatKm(reading.km)}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Registró {reading.author ?? "un usuario"}, {formatDateTime(reading.createdAt)}
                        </p>
                        {reading.changes.map((c) => (
                          <p key={c.id} className="mt-1 text-sm">
                            Corregida de <span className="whitespace-nowrap">{formatKm(c.previousKm)}</span> a{" "}
                            <span className="whitespace-nowrap">{formatKm(c.newKm ?? 0)}</span> por {c.author ?? "un usuario"},{" "}
                            {formatDateTime(c.createdAt)}
                            {c.reason && <span className="block whitespace-pre-line text-muted-foreground">{c.reason}</span>}
                          </p>
                        ))}
                      </div>
                      {permission && (
                        <ReadingActions
                          readingId={reading.id}
                          km={reading.km}
                          week={reading.week}
                          economicNumber={economicNumber}
                          reasonRequired={permission.reasonRequired}
                          isCurrentWeek={reading.week === currentWeek}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
              <div ref={sentinelRef} className="py-2 text-center text-sm text-muted-foreground" aria-live="polite">
                {loading && (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    Cargando más lecturas…
                  </span>
                )}
                {error && (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className="min-h-11 font-medium text-destructive underline underline-offset-2"
                  >
                    {error} Toca para reintentar.
                  </button>
                )}
              </div>
            </div>
          )}

          {removed.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <h3 className="mb-2 text-sm font-semibold">Lecturas quitadas</h3>
              <ul className="grid gap-2">
                {removed.map((c) => (
                  <li key={c.id} className="min-w-0 text-sm">
                    <span className="whitespace-nowrap">{formatKm(c.previousKm)}</span> de la semana del {formatDate(c.week)},
                    quitada por {c.author ?? "un usuario"}, {formatDateTime(c.createdAt)}
                    {c.reason && <span className="block whitespace-pre-line text-muted-foreground">{c.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
