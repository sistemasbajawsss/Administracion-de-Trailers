"use client";

import { LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format";

import { ReceiptPicker, pendingReceiptMessage, type ReceiptDraft } from "./receipt-picker";
import { uploadReceipts } from "./upload-receipts";

/** Agregar comprobantes a un servicio que ya existe (detalle del servicio). */
export function ReceiptUploader({ serviceId, existingCount }: { serviceId: string; existingCount: number }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<ReceiptDraft[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const ready = drafts.filter((d) => d.status === "ready");

  async function handleUpload() {
    const pending = pendingReceiptMessage(drafts);
    if (pending) return void toast.error(pending);

    setIsUploading(true);
    const toastId = toast.loading("Subiendo comprobantes…");
    const outcome = await uploadReceipts(serviceId, drafts, (current, total) =>
      toast.loading(`Subiendo comprobante ${current} de ${total}…`, { id: toastId }),
    );
    setIsUploading(false);

    if (outcome.failed.length) {
      const first = outcome.failed[0]!;
      toast.error(
        outcome.uploaded
          ? `Se subieron ${outcome.uploaded}; falló ${first.name}: ${first.error}`
          : `No se subió ${first.name}: ${first.error}`,
        { id: toastId },
      );
    } else {
      toast.success(outcome.uploaded === 1 ? "Comprobante agregado" : `${outcome.uploaded} comprobantes agregados`, {
        id: toastId,
      });
    }
    for (const duplicate of outcome.duplicates) {
      toast.warning(`Ojo: ese archivo también está en el servicio de ${duplicate.economicNumber} del ${formatDate(duplicate.date)}.`);
    }

    // Se quedan en la lista solo los que fallaron o tienen error, para reintentar o quitar.
    const failedNames = new Set(outcome.failed.map((f) => f.name));
    setDrafts((current) => {
      const keep = current.filter((d) => d.status === "error" || failedNames.has(d.prepared?.name ?? ""));
      current.filter((d) => !keep.includes(d)).forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl));
      return keep;
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <ReceiptPicker
        drafts={drafts}
        onDraftsChange={setDrafts}
        existingCount={existingCount}
        serviceId={serviceId}
        disabled={isUploading}
      />
      {ready.length > 0 && (
        <Button type="button" size="touch" onClick={handleUpload} disabled={isUploading} className="w-full sm:w-auto">
          {isUploading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
          {isUploading
            ? "Subiendo…"
            : ready.length === 1
              ? "Subir comprobante"
              : `Subir ${ready.length} comprobantes`}
        </Button>
      )}
    </div>
  );
}
