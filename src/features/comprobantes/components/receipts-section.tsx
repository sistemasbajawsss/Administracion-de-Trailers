import { MAX_RECEIPTS_PER_SERVICE } from "@/lib/utils/files";

import { listReceipts } from "../queries";

import { ReceiptGallery } from "./receipt-gallery";
import { ReceiptUploader } from "./receipt-uploader";

/** Comprobantes en el detalle del servicio: ver todos, y agregar o quitar si se puede editar. */
export async function ReceiptsSection({
  serviceId,
  title,
  canEdit,
  className = "mt-10",
}: {
  serviceId: string;
  className?: string;
  /** "T-17 · 12/10/2026" (título del visor). */
  title: string;
  canEdit: boolean;
}) {
  const receipts = await listReceipts(serviceId);

  return (
    <section aria-labelledby="comprobantes" className={className}>
      <h2 id="comprobantes" className="mb-4 text-2xl font-semibold">
        Comprobantes{" "}
        {receipts.length > 0 && <span className="text-muted-foreground tabular-nums">{receipts.length}</span>}
      </h2>

      {/* Comprobantes a la izquierda y "Elegir archivo" a la derecha, en el mismo renglón. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          {receipts.length > 0 ? (
            <ReceiptGallery receipts={receipts} serviceId={serviceId} title={title} canEdit={canEdit} />
          ) : (
            <p className="text-muted-foreground">
              {canEdit ? "Este servicio no tiene comprobante. Toma una foto del ticket o sube el PDF." : "Sin comprobantes."}
            </p>
          )}
        </div>

        {canEdit && receipts.length < MAX_RECEIPTS_PER_SERVICE && (
          <div className="sm:w-80 sm:shrink-0">
            <ReceiptUploader serviceId={serviceId} existingCount={receipts.length} />
          </div>
        )}
      </div>
    </section>
  );
}

export function ReceiptsSectionSkeleton({ className = "mt-10" }: { className?: string }) {
  return <div className={`h-48 animate-pulse rounded-lg bg-muted ${className}`} aria-busy="true" aria-label="Cargando comprobantes" />;
}
