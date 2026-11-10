"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { loadHomeList } from "../actions";
import type { ServiceBrief } from "../types";

import { ServiceBriefList } from "./service-brief-list";

/**
 * "Ver los N" de una tarjeta de Inicio: abre una ventana con la lista completa,
 * con su propio scroll, que carga por tandas al acercarse al final (lo pidió el
 * usuario: la tarjeta muestra 10 y aquí se ven todos, sin alargar el Inicio).
 */
export function HomeListDialog({
  list,
  title,
  description,
  total,
  initialItems,
  showAuthor = false,
  showNoEntryReason = false,
}: {
  list: "sin_factura" | "sin_entrada";
  title: string;
  description: string;
  total: number;
  /** Los que ya muestra la tarjeta: la ventana sigue desde ahí. */
  initialItems: ServiceBrief[];
  showAuthor?: boolean;
  showNoEntryReason?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [done, setDone] = useState(initialItems.length >= total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [boxReady, setBoxReady] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadHomeList({ list, offset: items.length });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((current) => {
        // Si alguien capturó mientras tanto, un renglón puede repetirse: se descarta.
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.data.filter((item) => !seen.has(item.id))];
      });
      if (result.data.length === 0 || items.length + result.data.length >= total) setDone(true);
    } catch {
      setError("No se pudo conectar. Revisa tu internet.");
    } finally {
      setLoading(false);
    }
  }, [loading, done, list, items.length, total]);

  useEffect(() => {
    const box = boxRef.current;
    const sentinel = sentinelRef.current;
    // Con error no se vigila (evita pedir en bucle sin señal); se reintenta con el botón.
    if (!open || !boxReady || !box || !sentinel || done || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root: box, rootMargin: "0px 0px 300px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, boxReady, loadMore, done, error]);

  return (
    <>
      <Button type="button" variant="outline" size="touch" className="mt-3 w-full sm:w-auto" onClick={() => setOpen(true)}>
        Ver los {total}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setBoxReady(false);
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {title} <span className="tabular-nums text-muted-foreground">{total}</span>
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div
            ref={(node) => {
              boxRef.current = node;
              if (node && !boxReady) setBoxReady(true);
            }}
            className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4"
            // Al tocar un servicio se cierra: si no, al volver a Inicio seguía abierta.
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <ServiceBriefList services={items} showAuthor={showAuthor} showNoEntryReason={showNoEntryReason} />
            <div ref={sentinelRef} className="py-3 text-center text-sm text-muted-foreground" aria-live="polite">
              {loading && (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Cargando más servicios…
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
              {done && !loading && !error && `Son todos: ${items.length} servicios.`}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
