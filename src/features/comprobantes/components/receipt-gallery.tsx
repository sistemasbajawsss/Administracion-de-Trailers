"use client";

import { Download, ExternalLink, FileText, ImageOff, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/utils/files";
import { formatDateTime } from "@/lib/utils/format";

import type { Receipt } from "../types";

import { RemoveReceiptDialog } from "./remove-receipt-dialog";

/** Toda petición pasa por /comprobantes/[id]: sesión + RLS + URL firmada de 60 s. */
const fileUrl = (id: string, download = false) => `/comprobantes/${id}${download ? "?descargar=1" : ""}`;

/**
 * Comprobantes del servicio: fotos en miniatura (se abren en grande) y PDF como
 * hoja (se abre en otra pestaña). Quitar solo si el usuario puede editar.
 */
export function ReceiptGallery({
  receipts,
  serviceId,
  canEdit,
}: {
  receipts: Receipt[];
  serviceId: string;
  canEdit: boolean;
}) {
  const [viewing, setViewing] = useState<Receipt | null>(null);
  const [removing, setRemoving] = useState<Receipt | null>(null);

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {receipts.map((receipt) => (
          <li key={receipt.id} className="flex flex-col">
            {receipt.mimeType === "application/pdf" ? (
              <a
                href={fileUrl(receipt.id)}
                target="_blank"
                rel="noopener"
                className="group flex aspect-[4/5] flex-col justify-between rounded-lg border bg-white p-3 shadow-[0_1px_0_var(--border),0_2px_0_var(--border)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <FileText className="size-8 text-brand-ink" aria-hidden="true" />
                <span className="font-heading text-3xl font-bold tracking-wide text-brand-ink">PDF</span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
                  Abrir <ExternalLink className="size-3.5" aria-hidden="true" />
                </span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setViewing(receipt)}
                className="aspect-[4/5] overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`Ver ${receipt.fileName}`}
              >
                <Thumbnail receipt={receipt} />
              </button>
            )}
            <p className="mt-2 truncate text-sm font-medium" title={receipt.fileName}>
              {receipt.fileName}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">{formatFileSize(receipt.size)}</p>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="touch"
                onClick={() => setRemoving(receipt)}
                className="-ml-2 self-start text-muted-foreground hover:text-destructive"
              >
                <Trash2 aria-hidden="true" />
                Quitar
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-3xl">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 font-heading text-xl break-all">{viewing.fileName}</DialogTitle>
                <DialogDescription>Agregado el {formatDateTime(viewing.createdAt)}</DialogDescription>
              </DialogHeader>
              {/* La imagen viene de una URL firmada de Storage: next/image no aplica. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(viewing.id)}
                alt={`Comprobante ${viewing.fileName}`}
                className="mx-auto max-h-[65dvh] w-auto rounded-md bg-muted object-contain"
              />
              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <a href={fileUrl(viewing.id)} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "touch" })}>
                  <ExternalLink aria-hidden="true" />
                  Abrir en otra pestaña
                </a>
                <a href={fileUrl(viewing.id, true)} className={buttonVariants({ variant: "outline", size: "touch" })}>
                  <Download aria-hidden="true" />
                  Descargar
                </a>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {removing && (
        <RemoveReceiptDialog
          receiptId={removing.id}
          serviceId={serviceId}
          fileName={removing.fileName}
          open
          onOpenChange={(open) => !open && setRemoving(null)}
        />
      )}
    </>
  );
}

function Thumbnail({ receipt }: { receipt: Receipt }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-muted-foreground">
        <ImageOff className="size-6" aria-hidden="true" />
        No se pudo cargar
      </span>
    );
  }
  return (
    // URL firmada de Storage detrás de /comprobantes/[id]: next/image no aplica.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fileUrl(receipt.id)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-full object-cover"
    />
  );
}
