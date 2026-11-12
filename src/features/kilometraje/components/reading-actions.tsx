"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatKm } from "@/lib/utils/format";

import { correctReading, removeReading } from "../actions";
import { makeCorrectReadingSchema, type CorrectReadingInput } from "../schemas";

const OFFLINE = "No se pudo conectar. Revisa tu internet e inténtalo de nuevo.";

/**
 * "Corregir" y "Quitar" de una lectura semanal (5H, D15). Quien la capturó lo
 * hace el mismo día sin motivo; después, solo el admin y con motivo
 * (`reasonRequired`). La BD vuelve a revisar las dos reglas.
 */
export function ReadingActions({
  readingId,
  km,
  week,
  economicNumber,
  reasonRequired,
  isCurrentWeek,
}: {
  readingId: string;
  km: number;
  /** Lunes de la semana de la lectura. */
  week: string;
  economicNumber: string;
  reasonRequired: boolean;
  isCurrentWeek: boolean;
}) {
  const [mode, setMode] = useState<"correct" | "remove" | null>(null);
  const close = () => setMode(null);

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="min-h-11" onClick={() => setMode("correct")}>
        <Pencil aria-hidden="true" />
        Corregir
      </Button>
      <Button variant="ghost" className="min-h-11 text-red-800 hover:text-red-900" onClick={() => setMode("remove")}>
        <Trash2 aria-hidden="true" />
        Quitar
      </Button>

      <Dialog open={mode === "correct"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {mode === "correct" && (
            <CorrectForm
              readingId={readingId}
              km={km}
              week={week}
              economicNumber={economicNumber}
              reasonRequired={reasonRequired}
              onDone={close}
            />
          )}
        </DialogContent>
      </Dialog>

      <RemoveDialog
        open={mode === "remove"}
        readingId={readingId}
        km={km}
        week={week}
        economicNumber={economicNumber}
        reasonRequired={reasonRequired}
        isCurrentWeek={isCurrentWeek}
        onDone={close}
      />
    </div>
  );
}

function CorrectForm({
  readingId,
  km,
  week,
  economicNumber,
  reasonRequired,
  onDone,
}: {
  readingId: string;
  km: number;
  week: string;
  economicNumber: string;
  reasonRequired: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm<CorrectReadingInput>({
    resolver: zodResolver(makeCorrectReadingSchema(reasonRequired)),
    defaultValues: { km: "", reason: "" },
  });

  async function onSubmit(values: CorrectReadingInput) {
    try {
      const result = await correctReading(readingId, values);
      if (!result.ok) return void form.setError("km", { message: result.error });
      toast.success(`Lectura de ${economicNumber} corregida`);
      onDone();
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl">Corregir la lectura de {economicNumber}</DialogTitle>
        <DialogDescription>
          Semana del {formatDate(week)}: se registró <span className="whitespace-nowrap">{formatKm(km)}</span>. Escribe el
          kilometraje correcto. Queda registrado quién la corrigió{reasonRequired ? " y por qué" : ""}.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Controller
          name="km"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="min-w-0">
              <FieldLabel htmlFor="reading-km">Kilometraje correcto</FieldLabel>
              <Input
                {...field}
                id="reading-km"
                inputMode="numeric"
                autoComplete="off"
                placeholder={`Ej. ${km}`}
                aria-invalid={fieldState.invalid}
                className="h-11 min-w-0 bg-white text-base tabular-nums"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="reason"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="reading-reason">Motivo{reasonRequired ? "" : " (opcional)"}</FieldLabel>
              <Textarea
                {...field}
                id="reading-reason"
                rows={2}
                maxLength={500}
                placeholder="Ej. Se escribió un número de más; la foto dice 125,400"
                aria-invalid={fieldState.invalid}
                className="text-base"
              />
              {reasonRequired && (
                <FieldDescription>Se verá junto a la lectura en la ficha de la unidad.</FieldDescription>
              )}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" size="touch" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="touch" disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Guardando…" : "Corregir lectura"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RemoveDialog({
  open,
  readingId,
  km,
  week,
  economicNumber,
  reasonRequired,
  isCurrentWeek,
  onDone,
}: {
  open: boolean;
  readingId: string;
  km: number;
  week: string;
  economicNumber: string;
  reasonRequired: boolean;
  isCurrentWeek: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (reasonRequired && reason.trim().length < 5) {
      setError("Escribe el motivo (mínimo 5 letras)");
      return;
    }
    setBusy(true);
    try {
      const result = await removeReading(readingId, { reason });
      if (!result.ok) return void setError(result.error);
      toast.success(`Lectura de ${economicNumber} quitada`);
      setReason("");
      onDone();
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          onDone();
        }
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl">¿Quitar la lectura de {economicNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quita la lectura de <span className="whitespace-nowrap">{formatKm(km)}</span> de la semana del{" "}
            {formatDate(week)}.{" "}
            {isCurrentWeek
              ? "La unidad vuelve a quedar pendiente esta semana."
              : "El kilometraje actual de la unidad se vuelve a calcular con sus otras lecturas."}{" "}
            Queda registrado quién la quitó.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor="remove-reason">Motivo{reasonRequired ? "" : " (opcional)"}</FieldLabel>
          <Textarea
            id="remove-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            placeholder="Ej. Era el kilometraje de otra unidad"
            aria-invalid={error !== null}
            className="text-base"
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
          <Button size="touch" variant="destructive" disabled={busy} onClick={() => void remove()}>
            {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {busy ? "Quitando…" : "Quitar lectura"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
