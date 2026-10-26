"use client";

import { createClient } from "@/lib/supabase/client";
import { RECEIPTS_BUCKET } from "@/lib/supabase/storage";

import { createReceiptUpload, registerReceipt } from "../actions";
import type { DuplicateReceipt } from "../types";

import type { ReceiptDraft } from "./receipt-picker";

export type UploadOutcome = {
  uploaded: number;
  failed: { name: string; error: string }[];
  /** Archivos que ya estaban en otro servicio y el navegador no pudo avisar antes. */
  duplicates: DuplicateReceipt[];
};

/**
 * Sube los comprobantes listos de un servicio, uno por uno (flujo de
 * docs/ARQUITECTURA.md): URL firmada → Storage directo → registro con revisión.
 * El navegador no tiene sesión de Supabase (cookie httpOnly); la URL firmada basta.
 */
export async function uploadReceipts(
  serviceId: string,
  drafts: ReceiptDraft[],
  onProgress?: (current: number, total: number) => void,
): Promise<UploadOutcome> {
  const ready = drafts.filter((d) => d.status === "ready" && d.prepared);
  const outcome: UploadOutcome = { uploaded: 0, failed: [], duplicates: [] };
  const storage = createClient().storage.from(RECEIPTS_BUCKET);

  for (const [index, draft] of ready.entries()) {
    const file = draft.prepared!;
    onProgress?.(index + 1, ready.length);
    try {
      const ticket = await createReceiptUpload({ serviceId, mimeType: file.mimeType, size: file.size });
      if (!ticket.ok) {
        outcome.failed.push({ name: file.name, error: ticket.error });
        continue;
      }

      const { error } = await storage.uploadToSignedUrl(ticket.data.path, ticket.data.token, file.blob, {
        contentType: file.mimeType,
      });
      if (error) {
        outcome.failed.push({ name: file.name, error: "No se pudo subir el archivo." });
        continue;
      }

      const result = await registerReceipt({
        serviceId,
        receiptId: ticket.data.receiptId,
        mimeType: file.mimeType,
        fileName: file.name,
      });
      if (!result.ok) {
        outcome.failed.push({ name: file.name, error: result.error });
        continue;
      }
      outcome.uploaded += 1;
      // Si el navegador ya avisó y el usuario decidió subirlo, no se repite el aviso.
      if (result.data.duplicateOf && !draft.duplicate) outcome.duplicates.push(result.data.duplicateOf);
    } catch {
      outcome.failed.push({ name: file.name, error: "Se perdió la conexión." });
    }
  }
  return outcome;
}
