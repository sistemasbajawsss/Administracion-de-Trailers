"use client";

import { ChevronLeft, ChevronRight, Download, LoaderCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/utils/files";

import { getServiceReceipts } from "../actions";
import type { Receipt } from "../types";

// pdf.js solo se descarga cuando alguien abre un PDF.
const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-48 items-center justify-center text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" aria-label="Cargando visor" />
    </div>
  ),
});

/** Empieza a cargar el visor de PDF y pdf.js antes de que se toque el botón. */
export function preloadPdfViewer() {
  void import("./pdf-viewer").then((m) => m.loadPdfjs()).catch(() => {});
}

/** Toda petición pasa por /comprobantes/[id]: sesión + RLS + URL firmada de 60 s. */
export const receiptFileUrl = (id: string, download = false) => `/comprobantes/${id}${download ? "?descargar=1" : ""}`;

/**
 * Visor de comprobantes en un modal, sin salir de la página: fotos y PDF (con
 * pdf.js). Si no recibe la lista, la pide al abrirse. Con varios comprobantes se
 * pasa de uno a otro con los botones o con las flechas del teclado.
 * Se monta al abrirse (empieza en initialIndex cada vez).
 */
export function ReceiptViewer({
  open,
  onOpenChange,
  serviceId,
  title,
  receipts: givenReceipts,
  initialIndex = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceId: string;
  /** "T-17 · 12/10/2026". */
  title: string;
  receipts?: Receipt[];
  initialIndex?: number;
}) {
  const [fetched, setFetched] = useState<Receipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(initialIndex);
  const receipts = givenReceipts ?? fetched;

  useEffect(() => {
    if (!open || givenReceipts || fetched) return;
    let cancelled = false;
    getServiceReceipts(serviceId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setFetched(result.data);
        else setError(result.error);
      })
      .catch(() => !cancelled && setError("No se pudo conectar. Revisa tu internet e inténtalo de nuevo."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se pide una vez al abrir
  }, [open, serviceId]);

  const total = receipts?.length ?? 0;
  const current = receipts?.[Math.min(index, Math.max(total - 1, 0))];
  const go = (step: number) => setIndex((i) => (i + step + total) % total);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[calc(100dvh-2rem)] flex-col gap-3 sm:h-[min(90dvh,60rem)] sm:max-w-3xl"
        onKeyDown={(event) => {
          if (total < 2) return;
          if (event.key === "ArrowRight") go(1);
          if (event.key === "ArrowLeft") go(-1);
        }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="font-heading text-xl">Factura · {title}</DialogTitle>
          <DialogDescription className="truncate">
            {current
              ? `${total > 1 ? `${index + 1} de ${total} · ` : ""}${current.fileName} · ${formatFileSize(current.size)}`
              : error ?? "Cargando comprobantes…"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md bg-muted/60 p-2">
          {!receipts && !error && (
            <div className="flex h-full items-center justify-center">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Cargando" />
            </div>
          )}
          {receipts && total === 0 && (
            <p className="flex h-full items-center justify-center text-muted-foreground">Este servicio no tiene comprobantes.</p>
          )}
          {current &&
            (current.mimeType === "application/pdf" ? (
              <PdfViewer key={current.id} url={receiptFileUrl(current.id)} title={current.fileName} />
            ) : (
              <ImageView key={current.id} receipt={current} />
            ))}
        </div>

        <DialogFooter className="flex-row items-center gap-2 sm:justify-between">
          {total > 1 ? (
            <div className="flex gap-2">
              <Button variant="outline" size="icon-touch" onClick={() => go(-1)} aria-label="Comprobante anterior">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-touch" onClick={() => go(1)} aria-label="Comprobante siguiente">
                <ChevronRight />
              </Button>
            </div>
          ) : (
            <span />
          )}
          {current && (
            <a href={receiptFileUrl(current.id, true)} className={buttonVariants({ variant: "outline", size: "touch" })}>
              <Download aria-hidden="true" />
              Descargar
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImageView({ receipt }: { receipt: Receipt }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  return (
    <div className="relative flex min-h-full items-center justify-center">
      {state === "loading" && (
        <LoaderCircle className="absolute size-6 animate-spin text-muted-foreground" aria-label="Cargando imagen" />
      )}
      {state === "error" ? (
        <p className="p-6 text-center text-muted-foreground">No se pudo cargar la imagen. Usa “Descargar”.</p>
      ) : (
        // URL firmada de Storage detrás de /comprobantes/[id]: next/image no aplica.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={receiptFileUrl(receipt.id)}
          alt={`Comprobante ${receipt.fileName}`}
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
          className="max-h-full w-auto max-w-full rounded-sm object-contain"
        />
      )}
    </div>
  );
}
