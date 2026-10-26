import type { ReceiptMimeType } from "@/lib/utils/files";

/** Comprobante registrado de un servicio. El archivo se abre en /comprobantes/[id]. */
export type Receipt = {
  id: string;
  mimeType: ReceiptMimeType;
  size: number;
  fileName: string;
  createdAt: string;
};

/** El mismo archivo ya está en otro servicio (D7: se avisa y se puede subir). */
export type DuplicateReceipt = {
  serviceId: string;
  economicNumber: string;
  date: string;
  /** Quien pregunta puede abrir ese servicio (el capturista solo los suyos). */
  canView: boolean;
};

/** Permiso para subir un archivo directo a Storage. */
export type ReceiptUploadTicket = {
  receiptId: string;
  path: string;
  token: string;
};
