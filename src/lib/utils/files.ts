/**
 * Archivos de comprobantes: tipos aceptados, revisión por firma de bytes y
 * preparación en el navegador (reducir fotos y calcular SHA-256).
 * detectFileType y las constantes se usan también en el servidor.
 */

export const RECEIPT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

/** El mismo límite que el bucket y la tabla. */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const MAX_RECEIPTS_PER_SERVICE = 10;

const EXTENSIONS: Record<ReceiptMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionFor(mimeType: ReceiptMimeType) {
  return EXTENSIONS[mimeType];
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);

/**
 * Qué es el archivo según sus primeros bytes, no según su nombre o lo que diga
 * el navegador. Un .exe renombrado a .pdf regresa null.
 */
export function detectFileType(bytes: Uint8Array): ReceiptMimeType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp"; // RIFF....WEBP
  }
  return null;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-MX", { maximumFractionDigits: 1 })} MB`;
}

// ---------------------------------------------------------------------------
// Solo navegador
// ---------------------------------------------------------------------------

/** Error con un mensaje listo para mostrar al usuario. */
export class ReceiptFileError extends Error {}

export type PreparedReceipt = {
  blob: Blob;
  mimeType: ReceiptMimeType;
  name: string;
  size: number;
  /** null si el navegador no puede calcularlo (http sin candado, en desarrollo). */
  hash: string | null;
};

/** Lado mayor de las fotos: se lee bien un ticket y pesa unos cientos de KB. */
const MAX_IMAGE_SIDE = 2000;
const JPEG_QUALITY = 0.82;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    // El navegador ya endereza la foto según su orientación (EXIF).
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ReceiptFileError("No se pudo leer la imagen. Usa una foto JPG o PNG, o un PDF."));
    };
    image.src = url;
  });
}

async function shrinkImage(file: Blob): Promise<Blob> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new ReceiptFileError("Este navegador no pudo procesar la foto.");
  // Fondo blanco: un PNG con transparencia no queda negro en JPEG.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ReceiptFileError("No se pudo reducir la foto."))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

async function sha256(blob: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function withExtension(name: string, extension: string) {
  const base = name.replace(/\.[^.]+$/, "").trim() || "comprobante";
  return `${base.slice(0, 180)}.${extension}`;
}

/**
 * Deja el archivo listo para subir: los PDF van tal cual; las fotos se reducen a
 * JPEG (también HEIC del iPhone, si el navegador lo abre). Si la foto reducida
 * pesara más que la original y la original ya es válida, se queda la original.
 */
export async function prepareReceiptFile(file: File): Promise<PreparedReceipt> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectFileType(head);

  let blob: Blob = file;
  let mimeType: ReceiptMimeType;

  if (detected === "application/pdf") {
    mimeType = detected;
  } else if (detected || file.type.startsWith("image/")) {
    const shrunk = await shrinkImage(file);
    if (detected && file.size <= shrunk.size && file.size <= MAX_RECEIPT_BYTES) {
      mimeType = detected;
    } else {
      blob = shrunk;
      mimeType = "image/jpeg";
    }
  } else {
    throw new ReceiptFileError("Solo se aceptan PDF o fotos (JPG, PNG, WebP).");
  }

  if (blob.size > MAX_RECEIPT_BYTES) {
    throw new ReceiptFileError(`El archivo pesa ${formatFileSize(blob.size)}; el máximo es 10 MB.`);
  }

  return {
    blob,
    mimeType,
    name: withExtension(file.name, extensionFor(mimeType)),
    size: blob.size,
    hash: await sha256(blob),
  };
}
