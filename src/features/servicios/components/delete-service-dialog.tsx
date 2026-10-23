"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
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

import { deleteService } from "../actions";
import { deleteServiceSchema } from "../schemas";

/** Eliminar servicio (solo admin) con motivo obligatorio. */
export function DeleteServiceDialog({
  serviceId,
  unitId,
  label,
}: {
  serviceId: string;
  unitId: string;
  /** "el servicio de T-17 del 23/10/2026". */
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    const parsed = deleteServiceSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Escribe el motivo");
      return;
    }
    startTransition(async () => {
      try {
        const result = await deleteService(serviceId, unitId, parsed.data);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Servicio eliminado. Puedes restaurarlo desde Servicios › Eliminados.");
        setOpen(false);
        router.push("/servicios");
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="touch" onClick={() => setOpen(true)} className="text-destructive hover:text-destructive">
        <Trash2 aria-hidden="true" />
        Eliminar
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setReason("");
            setError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">¿Eliminar {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de contar en totales y listas. Queda una copia con tu nombre y el motivo, y se puede restaurar desde Servicios › Eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="delete-reason">Motivo</FieldLabel>
            <Textarea
              id="delete-reason"
              rows={2}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
              placeholder="Ej. Se capturó dos veces"
              aria-invalid={Boolean(error)}
              className="text-base"
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
            <Button variant="destructive" size="touch" onClick={confirm} disabled={isPending}>
              {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isPending ? "Eliminando…" : "Eliminar servicio"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
