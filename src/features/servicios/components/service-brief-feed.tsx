"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadMoreServicesOfType } from "../actions";
import type { ServiceBrief, ServiceType } from "../types";

import { ServiceBriefList } from "./service-brief-list";

/**
 * Servicios de un tipo (pestaña Preventivos de Mantenimientos, 5F) con el scroll
 * normal de la página: al acercarse al final se pide la siguiente tanda (sin
 * cuadro con scroll propio, igual que Gastos).
 */
export function ServiceBriefFeed({
  type,
  initialItems,
  totalCount,
  batchSize,
}: {
  type: ServiceType;
  initialItems: ServiceBrief[];
  totalCount: number;
  batchSize: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [done, setDone] = useState(initialItems.length >= totalCount || initialItems.length < batchSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadMoreServicesOfType({ type, offset: items.length });
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
  }, [loading, done, type, items.length, batchSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    // Con error no se vigila (evita pedir en bucle sin señal); se reintenta con el botón.
    if (!sentinel || done || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "0px 0px 400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, done, error]);

  return (
    <div className="rounded-xl border bg-white px-3 py-1 sm:px-4">
      <ServiceBriefList services={items} showAuthor />
      <div ref={sentinelRef} className="px-2 py-3 text-center text-sm text-muted-foreground" aria-live="polite">
        {loading && (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Cargando más servicios…
          </span>
        )}
        {error && (
          <button type="button" onClick={() => void loadMore()} className="min-h-11 font-medium text-destructive underline underline-offset-2">
            {error} Toca para reintentar.
          </button>
        )}
        {done && !loading && items.length > batchSize && `Son todos: ${items.length} servicios.`}
      </div>
    </div>
  );
}
