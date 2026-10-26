import { MAX_RECEIPTS_PER_SERVICE } from "@/lib/utils/files";

import { listReceipts } from "../queries";

import { ReceiptGallery } from "./receipt-gallery";
import { ReceiptUploader } from "./receipt-uploader";

/** Comprobantes en el detalle del servicio: ver todos, y agregar o quitar si se puede editar. */
export async function ReceiptsSection({ serviceId, canEdit }: { serviceId: string; canEdit: boolean }) {
  const receipts = await listReceipts(serviceId);

  return (
    <section aria-labelledby="comprobantes" className="mt-10">
      <h2 id="comprobantes" className="mb-4 text-2xl font-semibold">
        Comprobantes{" "}
        {receipts.length > 0 && <span className="text-muted-foreground tabular-nums">{receipts.length}</span>}
      </h2>

      {receipts.length > 0 ? (
        <ReceiptGallery receipts={receipts} serviceId={serviceId} canEdit={canEdit} />
      ) : (
        <p className="mb-4 text-muted-foreground">
          {canEdit ? "Este servicio no tiene comprobante. Toma una foto del ticket o sube el PDF." : "Sin comprobantes."}
        </p>
      )}

      {canEdit && receipts.length < MAX_RECEIPTS_PER_SERVICE && (
        <div className={receipts.length > 0 ? "mt-6" : ""}>
          <ReceiptUploader serviceId={serviceId} existingCount={receipts.length} />
        </div>
      )}
    </section>
  );
}

export function ReceiptsSectionSkeleton() {
  return <div className="mt-10 h-48 animate-pulse rounded-lg bg-muted" aria-busy="true" aria-label="Cargando comprobantes" />;
}
