"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CurrentUser } from "@/lib/auth/types";

import { loadMoreTicketHistory } from "../actions";
import type { Ticket } from "../types";
import { TicketItem, useNow } from "./ticket-item";

/**
 * Historial de tickets (aceptados, rechazados y cancelados), el más nuevo
 * primero. Va en su propio cuadro con scroll (máximo 60 % de la pantalla) y
 * carga por tandas dentro del cuadro, como las estancias de la ficha.
 */
export function TicketHistory({
  initialTickets,
  total,
  batchSize,
  viewer,
  now: serverNow,
  linkUnit,
}: {
  initialTickets: Ticket[];
  total: number;
  batchSize: number;
  viewer: Pick<CurrentUser, "id" | "role">;
  now: string;
  linkUnit: boolean;
}) {
  const now = useNow(serverNow);
  const [tickets, setTickets] = useState(initialTickets);
  const [done, setDone] = useState(initialTickets.length >= total || initialTickets.length < batchSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadMoreTicketHistory(tickets.length);
      if (!result.ok) return void setError(result.error);
      setTickets((current) => {
        const seen = new Set(current.map((t) => t.id));
        return [...current, ...result.data.filter((t) => !seen.has(t.id))];
      });
      if (result.data.length < batchSize) setDone(true);
    } catch {
      setError("No se pudo conectar. Revisa tu internet.");
    } finally {
      setLoading(false);
    }
  }, [loading, done, tickets.length, batchSize]);

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

  if (total === 0) {
    return <p className="rounded-xl border bg-white px-4 py-6 text-muted-foreground">Todavía no hay tickets atendidos.</p>;
  }

  return (
    <div
      ref={boxRef}
      role="region"
      aria-label="Historial de tickets"
      tabIndex={0}
      className="max-h-[min(48rem,60dvh)] overflow-y-auto rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ol className="space-y-3">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <TicketItem ticket={ticket} viewer={viewer} now={now} linkUnit={linkUnit} />
          </li>
        ))}
      </ol>
      <div ref={sentinelRef} className="py-3 text-center text-sm text-muted-foreground" aria-live="polite">
        {loading && (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Cargando más tickets…
          </span>
        )}
        {error && (
          <button type="button" onClick={() => void loadMore()} className="min-h-11 font-medium text-destructive underline underline-offset-2">
            {error} Toca para reintentar.
          </button>
        )}
      </div>
    </div>
  );
}

/** Lista corta de tickets (pendientes o rechazos sin ver), con el "espera hace" al día. */
export function TicketList({
  tickets,
  viewer,
  now: serverNow,
  linkUnit,
  label,
}: {
  tickets: Ticket[];
  viewer: Pick<CurrentUser, "id" | "role">;
  now: string;
  linkUnit: boolean;
  label: string;
}) {
  const now = useNow(serverNow);
  return (
    <ol aria-label={label} className="space-y-3">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <TicketItem ticket={ticket} viewer={viewer} now={now} linkUnit={linkUnit} />
        </li>
      ))}
    </ol>
  );
}
