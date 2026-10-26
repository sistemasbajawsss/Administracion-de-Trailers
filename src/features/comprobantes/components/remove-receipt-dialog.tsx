"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import { removeReceipt } from "../actions";
import { removeReceiptSchema } from "../schemas";

/** Quitar un comprobante con motivo obligatorio (D7: igual que editar). */
export function RemoveReceiptDialog({
  receiptId,
  serviceId,
  fileName,
  open,
  onOpenChange,
  onRemoved,
}: {
  receiptId: string;
  serviceId: string;
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    const parsed = removeReceiptSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Escribe el motivo");
      return;
    }
    startTransition(async () => {
      try {
        const result = await removeReceipt(receiptId, serviceId, parsed.data);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Comprobante quitado");
        onOpenChange(false);
        onRemoved?.();
        router.refresh();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setReason("");
          setError(null);
        }
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl">¿Quitar este comprobante?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium break-all text-foreground">{fileName}</span> se borra del servicio. Queda en
            la línea de cambios con tu nombre y el motivo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="remove-receipt-reason">Motivo</FieldLabel>
          <Textarea
            id="remove-receipt-reason"
            rows={2}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            placeholder="Ej. Era el ticket de otra unidad"
            aria-invalid={Boolean(error)}
            className="text-base"
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
          <Button variant="destructive" size="touch" onClick={confirm} disabled={isPending}>
            {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isPending ? "Quitando…" : "Quitar comprobante"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
