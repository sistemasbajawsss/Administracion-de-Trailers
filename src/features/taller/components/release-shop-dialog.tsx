"use client";

import { DoorOpen, LoaderCircle } from "lucide-react";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils/format";

import { releaseFromShop } from "../actions";
import { shopReleaseSchema } from "../schemas";

/** Dar salida de taller: fecha (hoy por defecto) y nota opcional. La unidad regresa a Activo. */
export function ReleaseShopDialog({
  entryId,
  economicNumber,
  entryDate,
  today,
}: {
  entryId: string;
  economicNumber: string;
  entryDate: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setDate(today);
    setNote("");
    setError(null);
  }

  function confirm() {
    const parsed = shopReleaseSchema.safeParse({ entryId, date, note });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Revisa la fecha");
    if (parsed.data.date < entryDate) return setError(`La salida no puede ser antes de la entrada (${formatDate(entryDate)})`);
    if (parsed.data.date > today) return setError("La fecha de salida no puede ser futura");

    startTransition(async () => {
      try {
        const result = await releaseFromShop(parsed.data);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`${economicNumber} salió de taller y quedó como Activo`);
        setOpen(false);
        reset();
        router.refresh();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="touch" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <DoorOpen aria-hidden="true" />
        Dar salida
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">¿Dar salida a {economicNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sale de la lista de Taller y regresa a Activo. Entró el {formatDate(entryDate)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`salida-fecha-${entryId}`}>Fecha de salida</FieldLabel>
            <Input
              id={`salida-fecha-${entryId}`}
              type="date"
              value={date}
              min={entryDate}
              max={today}
              onChange={(event) => {
                setDate(event.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              className="h-11 min-w-0 bg-white text-base"
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`salida-nota-${entryId}`}>Nota (opcional)</FieldLabel>
            <Textarea
              id={`salida-nota-${entryId}`}
              rows={2}
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ej. Se cambiaron balatas, quedó lista"
              className="text-base"
            />
            <FieldDescription>Si registras el servicio, ahí van los gastos; aquí solo cómo quedó.</FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
            <Button size="touch" onClick={confirm} disabled={isPending}>
              {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isPending ? "Guardando…" : "Dar salida"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
