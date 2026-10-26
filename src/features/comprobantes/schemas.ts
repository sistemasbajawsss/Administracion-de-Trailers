import { z } from "zod";

import { MAX_RECEIPT_BYTES, RECEIPT_MIME_TYPES } from "@/lib/utils/files";

export const receiptUploadSchema = z.object({
  serviceId: z.uuid(),
  mimeType: z.enum(RECEIPT_MIME_TYPES),
  size: z.number().int().positive().max(MAX_RECEIPT_BYTES),
});

export const receiptRegisterSchema = z.object({
  serviceId: z.uuid(),
  receiptId: z.uuid(),
  mimeType: z.enum(RECEIPT_MIME_TYPES),
  fileName: z.string().trim().min(1).max(200),
});

export const duplicateCheckSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});

export const removeReceiptSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Explica por qué se quita (mínimo 5 letras)")
    .max(500, "Motivo: máximo 500 caracteres"),
});
