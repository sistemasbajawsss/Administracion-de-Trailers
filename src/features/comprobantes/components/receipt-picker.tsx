"use client";

import { Camera, FileText, FileUp, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import {
  MAX_RECEIPTS_PER_SERVICE,
  ReceiptFileError,
  formatFileSize,
  prepareReceiptFile,
  type PreparedReceipt,
} from "@/lib/utils/files";
import { formatDate } from "@/lib/utils/format";

import { findDuplicateReceipt } from "../actions";
import type { DuplicateReceipt } from "../types";

export type ReceiptDraft = {
  key: string;
  originalName: string;
  status: "preparing" | "ready" | "error";
  prepared?: PreparedReceipt;
  /** Vista previa local (blob:) de las fotos. */
  previewUrl?: string;
  duplicate?: DuplicateReceipt | null;
  /** El usuario eligió "Subir de todos modos". */
  duplicateAccepted?: boolean;
  error?: string;
};

/** Mensaje si todavía hay algo por resolver antes de subir; null si está listo. */
export function pendingReceiptMessage(drafts: ReceiptDraft[]): string | null {
  if (drafts.some((d) => d.status === "preparing")) return "Espera a que terminen de prepararse los comprobantes.";
  if (drafts.some((d) => d.status === "ready" && d.duplicate && !d.duplicateAccepted)) {
    return "Hay un comprobante repetido: decide si lo subes o lo quitas.";
  }
  return null;
}

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

/**
 * Elegir comprobantes: foto con la cámara o archivo (PDF o imagen). Cada archivo
 * se prepara en el navegador (fotos reducidas, SHA-256) y se revisa si ya está en
 * otro servicio. No sube nada: eso lo hace quien lo usa, con uploadReceipts().
 */
export function ReceiptPicker({
  drafts,
  onDraftsChange,
  existingCount = 0,
  serviceId,
  disabled = false,
}: {
  drafts: ReceiptDraft[];
  onDraftsChange: Dispatch<SetStateAction<ReceiptDraft[]>>;
  /** Comprobantes que el servicio ya tiene (para el límite de 10). */
  existingCount?: number;
  /** Servicio al que se agregan, si ya existe (para detectar el mismo archivo ahí). */
  serviceId?: string;
  disabled?: boolean;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const available = MAX_RECEIPTS_PER_SERVICE - existingCount - drafts.length;

  // Liberar las vistas previas al salir de la pantalla.
  const latest = useRef(drafts);
  useEffect(() => {
    latest.current = drafts;
  }, [drafts]);
  useEffect(
    () => () => latest.current.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl)),
    [],
  );

  const update = (key: string, patch: Partial<ReceiptDraft>) =>
    onDraftsChange((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  function remove(key: string) {
    onDraftsChange((current) => {
      const draft = current.find((d) => d.key === key);
      if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      return current.filter((d) => d.key !== key);
    });
  }

  async function prepare(key: string, file: File) {
    try {
      const prepared = await prepareReceiptFile(file);
      const previewUrl = prepared.mimeType === "application/pdf" ? undefined : URL.createObjectURL(prepared.blob);

      let duplicate: DuplicateReceipt | null = null;
      if (prepared.hash) {
        const result = await findDuplicateReceipt({ hash: prepared.hash });
        if (result.ok) duplicate = result.data;
      }

      onDraftsChange((current) => {
        const repeated = prepared.hash && current.some((d) => d.key !== key && d.prepared?.hash === prepared.hash);
        const sameService = duplicate && serviceId && duplicate.serviceId === serviceId;
        return current.map((d) => {
          if (d.key !== key) return d;
          if (repeated || sameService) {
            return {
              ...d,
              status: "error",
              previewUrl,
              prepared,
              error: repeated ? "Ya agregaste este mismo archivo." : "Este archivo ya está en este servicio.",
            };
          }
          return { ...d, status: "ready", prepared, previewUrl, duplicate };
        });
      });
    } catch (error) {
      update(key, {
        status: "error",
        error: error instanceof ReceiptFileError ? error.message : "No se pudo preparar el archivo.",
      });
    }
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const accepted = Array.from(files).slice(0, Math.max(0, available));
    const added = accepted.map((file) => ({
      key: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      originalName: file.name,
      status: "preparing" as const,
    }));
    onDraftsChange((current) => [...current, ...added]);
    accepted.forEach((file, i) => void prepare(added[i]!.key, file));
  }

  const inputProps = {
    type: "file",
    className: "sr-only",
    tabIndex: -1,
    "aria-hidden": true,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(event.target.files);
      // Permite volver a elegir el mismo archivo después de quitarlo.
      event.target.value = "";
    },
  } as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={disabled || available <= 0}
          onClick={() => cameraInput.current?.click()}
          // La cámara directa (capture) solo existe en celulares y tablets; en una
          // computadora el navegador abre el explorador de archivos, así que se oculta.
          className="hidden sm:flex-1 pointer-coarse:inline-flex"
        >
          <Camera aria-hidden="true" />
          Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={disabled || available <= 0}
          onClick={() => fileInput.current?.click()}
          className="sm:flex-1"
        >
          <FileUp aria-hidden="true" />
          Elegir archivo
        </Button>
        <input ref={cameraInput} {...inputProps} accept="image/*" capture="environment" />
        <input ref={fileInput} {...inputProps} accept={ACCEPT} multiple />
      </div>
      <p className="text-sm text-muted-foreground">
        PDF o foto del ticket, hasta 10 MB. {available > 0
          ? `Puedes agregar ${available} más.`
          : `Ya son ${MAX_RECEIPTS_PER_SERVICE}, el máximo por servicio.`}
      </p>

      {drafts.length > 0 && (
        <ul className="divide-y rounded-xl border bg-white">
          {drafts.map((draft) => (
            <DraftRow
              key={draft.key}
              draft={draft}
              disabled={disabled}
              onRemove={() => remove(draft.key)}
              onAcceptDuplicate={() => update(draft.key, { duplicateAccepted: true })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DraftRow({
  draft,
  disabled,
  onRemove,
  onAcceptDuplicate,
}: {
  draft: ReceiptDraft;
  disabled: boolean;
  onRemove: () => void;
  onAcceptDuplicate: () => void;
}) {
  const name = draft.prepared?.name ?? draft.originalName;
  const pendingDuplicate = draft.status === "ready" && draft.duplicate && !draft.duplicateAccepted;

  return (
    <li className="p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {draft.previewUrl ? (
            // Vista previa local (blob:): next/image no aplica.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.previewUrl} alt="" className="size-full object-cover" />
          ) : draft.status === "preparing" ? (
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p
            className={`text-sm ${draft.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {draft.status === "preparing" && "Preparando…"}
            {draft.status === "error" && draft.error}
            {draft.status === "ready" && draft.prepared && (
              <>
                {formatFileSize(draft.prepared.size)}
                {draft.duplicateAccepted ? " · Se subirá aunque está repetido" : " · Listo"}
              </>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Quitar ${name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <X />
        </Button>
      </div>

      {pendingDuplicate && draft.duplicate && (
        <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
          <p className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Este archivo ya está en el servicio de{" "}
              <strong className="font-semibold">{draft.duplicate.economicNumber}</strong> del{" "}
              {formatDate(draft.duplicate.date)}.{" "}
              {draft.duplicate.canView && (
                <a
                  href={`/servicios/${draft.duplicate.serviceId}`}
                  target="_blank"
                  rel="noopener"
                  className="font-medium underline underline-offset-2"
                >
                  Ver ese servicio
                </a>
              )}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="touch" variant="outline" onClick={onAcceptDuplicate} className="bg-white">
              Subir de todos modos
            </Button>
            <Button type="button" size="touch" variant="ghost" onClick={onRemove}>
              Quitar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
