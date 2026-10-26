"use client";

import { FileText, ImageOff, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils/files";

import type { Receipt } from "../types";

import { RemoveReceiptDialog } from "./remove-receipt-dialog";
import { ReceiptViewer, receiptFileUrl } from "./receipt-viewer";

/**
 * Comprobantes del servicio como botones compactos (miniatura diminuta o ícono de
 * PDF, nombre y peso). Cualquiera se abre en el visor (modal) sin salir de la
 * página. Quitar solo si se puede editar.
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
  return (
    <>
      {/* Un botón compacto por comprobante; se ve en grande en el visor. */}
      <ul className="flex flex-wrap gap-2">
        {receipts.map((receipt, index) => (
          <li key={receipt.id} className="flex items-center rounded-lg border bg-white">
            <button
              type="button"
              onClick={() => setViewing(index)}
              aria-label={`Ver ${receipt.fileName}`}
              className="flex min-h-11 items-center gap-2 rounded-lg py-1.5 pr-3 pl-1.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {receipt.mimeType === "application/pdf" ? (
                  <FileText className="size-4 text-brand-ink" aria-hidden="true" />
                ) : (
                  <Thumbnail receipt={receipt} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block max-w-48 truncate text-sm font-medium" title={receipt.fileName}>
                  {receipt.fileName}
                </span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {receipt.mimeType === "application/pdf" ? "PDF" : "Foto"} · {formatFileSize(receipt.size)}
                </span>
              </span>
            </button>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                onClick={() => setRemoving(receipt)}
                aria-label={`Quitar ${receipt.fileName}`}
                className="mr-0.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
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
      <ImageOff className="size-4 text-muted-foreground" aria-label="No se pudo cargar" />
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
