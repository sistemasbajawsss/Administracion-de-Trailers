"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
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

import { restoreService } from "../actions";
import { restoreServiceSchema } from "../schemas";

/** Restaurar un servicio eliminado (solo admin) con motivo obligatorio. */
export function RestoreServiceDialog({
  historyId,
  label,
}: {
  historyId: number;
  /** "el servicio de T-17 del 23/10/2026". */
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    const parsed = restoreServiceSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Escribe el motivo");
      return;
    }
    startTransition(async () => {
      try {
        const result = await restoreService(historyId, parsed.data);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Servicio restaurado tal como estaba");
        setOpen(false);
        router.push(`/servicios/${result.data.id}`);
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="touch" onClick={() => setOpen(true)}>
        <RotateCcw aria-hidden="true" />
        Restaurar
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (isPending) return;
          setOpen(next);
          if (!next) {
            setReason("");
            setError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">¿Restaurar {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Regresa con sus gastos y a nombre de quien lo capturó. La restauración queda en su línea de cambios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`restore-reason-${historyId}`}>Motivo</FieldLabel>
            <Textarea
              id={`restore-reason-${historyId}`}
              rows={2}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
              placeholder="Ej. Se eliminó por error"
              aria-invalid={Boolean(error)}
              className="text-base"
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch" disabled={isPending}>
              Cancelar
            </AlertDialogCancel>
            <Button size="touch" onClick={confirm} disabled={isPending}>
              {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isPending ? "Restaurando…" : "Restaurar servicio"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
