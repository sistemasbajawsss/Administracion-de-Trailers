"use client";

import { FileText, ImageOff, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils/files";

import type { Receipt } from "../types";

import { RemoveReceiptDialog } from "./remove-receipt-dialog";
import { ReceiptViewer, receiptFileUrl } from "./receipt-viewer";

/**
 * Comprobantes del servicio: fotos en miniatura y PDF como hoja. Cualquiera se
 * abre en el visor (modal) sin salir de la página. Quitar solo si se puede editar.
 */
export function ReceiptGallery({
  receipts,
  serviceId,
  title,
  canEdit,
}: {
  receipts: Receipt[];
  serviceId: string;
  /** "T-17 · 12/10/2026". */
  title: string;
  canEdit: boolean;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Receipt | null>(null);
  const tileClass =
    "aspect-[4/5] overflow-hidden rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {receipts.map((receipt, index) => (
          <li key={receipt.id} className="flex flex-col">
            <button
              type="button"
              onClick={() => setViewing(index)}
              aria-label={`Ver ${receipt.fileName}`}
              className={
                receipt.mimeType === "application/pdf"
                  ? `${tileClass} flex flex-col justify-between bg-white p-3 text-left shadow-[0_1px_0_var(--border),0_2px_0_var(--border)]`
                  : `${tileClass} bg-muted`
              }
            >
              {receipt.mimeType === "application/pdf" ? (
                <>
                  <FileText className="size-8 text-brand-ink" aria-hidden="true" />
                  <span className="font-heading text-3xl font-bold tracking-wide text-brand-ink">PDF</span>
                  <span className="text-sm text-muted-foreground">Toca para ver</span>
                </>
              ) : (
                <Thumbnail receipt={receipt} />
              )}
            </button>
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

      {viewing !== null && (
        <ReceiptViewer
          open
          onOpenChange={(open) => !open && setViewing(null)}
          serviceId={serviceId}
          title={title}
          receipts={receipts}
          initialIndex={viewing}
        />
      )}

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
      src={receiptFileUrl(receipt.id)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-full object-cover"
    />
  );
}
