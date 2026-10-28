"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ViewReceiptsButton } from "@/features/comprobantes/components/view-receipts-button";
import { formatDate, formatMoney, formatUsd } from "@/lib/utils/format";

import { loadMoreExpenses } from "../actions";
import type { ServiceFilters } from "../schemas";
import type { ExpenseListItem } from "../types";

type Filters = Pick<ServiceFilters, "q" | "buscar" | "desde" | "hasta">;

/**
 * Gastos en un cuadro con su propio scroll: la página no crece y, al acercarse
 * al fondo del cuadro, se pide la siguiente tanda. Se reinicia cuando cambian
 * los filtros (quien lo usa le pone key con los filtros).
 */
export function ExpenseFeed({
  initialItems,
  totalCount,
  batchSize,
  filters,
  unitId,
  showUnit,
}: {
  initialItems: ExpenseListItem[];
  totalCount: number;
  batchSize: number;
  filters: Filters;
  unitId?: string;
  showUnit: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [done, setDone] = useState(initialItems.length >= totalCount || initialItems.length < batchSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadMoreExpenses({ filters, unitId, offset: items.length });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((current) => {
        // Si alguien capturó mientras tanto, un renglón puede repetirse: se descarta.
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.data.filter((item) => !seen.has(item.id))];
      });
      if (result.data.length < batchSize) setDone(true);
    } catch {
      setError("No se pudo conectar. Revisa tu internet.");
    } finally {
      setLoading(false);
    }
  }, [loading, done, filters, unitId, items.length, batchSize]);

  useEffect(() => {
    const box = boxRef.current;
    const sentinel = sentinelRef.current;
    if (!box || !sentinel || done) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      // Pide la siguiente tanda un poco antes de llegar al fondo del cuadro.
      { root: box, rootMargin: "0px 0px 240px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, done]);

  const columns = showUnit
    ? "md:grid-cols-[6.5rem_4.5rem_minmax(0,1fr)_8.5rem_10rem]"
    : "md:grid-cols-[6.5rem_minmax(0,1fr)_8.5rem_10rem]";

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      aria-label="Gastos. Desliza dentro del cuadro para ver más."
      className="max-h-[min(40rem,70dvh)] overflow-y-auto overscroll-contain rounded-xl border bg-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div
        aria-hidden="true"
        className={`sticky top-0 z-10 hidden items-center gap-4 border-b bg-muted/95 px-5 py-2.5 text-sm font-medium text-muted-foreground backdrop-blur md:grid ${columns}`}
      >
        <span>Fecha</span>
        {showUnit && <span>Unidad</span>}
        <span>Categoría</span>
        <span className="text-right">Monto</span>
        <span className="text-right">Factura</span>
      </div>

      <ul className="divide-y">
        {items.map((item) => (
          <li
            key={item.id}
            className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/40 md:px-5 md:py-2 ${columns}`}
          >
            <span className="col-start-1 row-start-1 text-sm text-muted-foreground tabular-nums md:text-base md:text-foreground">
              {formatDate(item.date)}
              {showUnit && item.economicNumber && (
                <span className="font-heading font-bold tracking-wide text-brand-ink md:hidden"> · {item.economicNumber}</span>
              )}
            </span>
            {showUnit && (
              <span className="hidden font-heading text-lg font-bold tracking-wide text-brand-ink tabular-nums md:block">
                {item.economicNumber ?? "—"}
              </span>
            )}
            <span className="col-start-1 row-start-2 min-w-0 md:col-start-auto md:row-start-auto">
              {/* El enlace cubre todo el renglón; el botón de factura queda encima. */}
              <Link
                href={`/servicios/${item.serviceId}`}
                className="block truncate font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
              >
                {item.category}
              </Link>
              {item.concept && <span className="block truncate text-sm text-muted-foreground">{item.concept}</span>}
            </span>
            <span className="col-start-2 row-start-1 text-right font-semibold tabular-nums md:col-start-auto md:row-start-auto">
              {formatMoney(item.amount)}
              {item.usd && (
                <span className="block text-xs font-normal text-muted-foreground">{formatUsd(item.usd.amount)}</span>
              )}
            </span>
            <span className="relative z-[1] col-start-2 row-start-2 justify-self-end md:col-start-auto md:row-start-auto">
              <ViewReceiptsButton
                serviceId={item.serviceId}
                title={`${item.economicNumber ?? "Unidad"} · ${formatDate(item.date)}`}
                count={item.receiptCount}
                hasPdf={item.hasPdf}
              />
            </span>
          </li>
        ))}
      </ul>

      <div ref={sentinelRef} className="px-5 py-4 text-center text-sm text-muted-foreground" aria-live="polite">
        {loading && (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Cargando más gastos…
          </span>
        )}
        {error && (
          <button type="button" onClick={() => void loadMore()} className="min-h-11 font-medium text-destructive underline underline-offset-2">
            {error} Toca para reintentar.
          </button>
        )}
        {done && !loading && items.length > batchSize && `Son todos: ${items.length} gastos.`}
      </div>
    </div>
  );
}
