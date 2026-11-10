"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Gauge, History, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { formatDate, formatDateTime, formatKm } from "@/lib/utils/format";
import { describeMileage } from "@/lib/utils/mileage";
import { useToday } from "@/components/shared/use-today";

import { correctUnitMileage } from "../actions";
import { correctMileageSchema, type CorrectMileageInput } from "../schemas";
import type { MileageCorrection, UnitMileage } from "../types";

/**
 * Botón de la celda "Kilometraje" de la ficha. El admin corrige el kilometraje
 * (con motivo) y ve las correcciones; el gerente solo las ve, si hay.
 */
export function UnitMileageActions({
  unitId,
  economicNumber,
  mileage,
  canCorrect,
  today,
}: {
  unitId: string;
  economicNumber: string;
  mileage: UnitMileage;
  canCorrect: boolean;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const count = mileage.corrections.length;
  if (!canCorrect && count === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="mt-3 min-h-11 sm:min-h-9">
        {canCorrect ? <Gauge aria-hidden="true" /> : <History aria-hidden="true" />}
        {canCorrect ? "Corregir" : `Ver correcciones (${count})`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {canCorrect ? (
            <CorrectionForm
              unitId={unitId}
              economicNumber={economicNumber}
              mileage={mileage}
              today={today}
              onDone={() => setOpen(false)}
            />
          ) : (
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">Correcciones de kilometraje de {economicNumber}</DialogTitle>
              <DialogDescription>Cambios hechos por un administrador, del más reciente al más viejo.</DialogDescription>
            </DialogHeader>
          )}
          {count > 0 && <CorrectionList corrections={mileage.corrections} withHeading={canCorrect} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CorrectionForm({
  unitId,
  economicNumber,
  mileage,
  today: serverToday,
  onDone,
}: {
  unitId: string;
  economicNumber: string;
  mileage: UnitMileage;
  today: string;
  onDone: () => void;
}) {
  const today = useToday(serverToday);
  const router = useRouter();
  const form = useForm<CorrectMileageInput>({
    resolver: zodResolver(correctMileageSchema),
    defaultValues: { mileage: "", date: today, reason: "" },
  });

  async function onSubmit(values: CorrectMileageInput) {
    if (values.date > today) {
      form.setError("date", { message: "La fecha no puede ser futura" });
      return;
    }
    try {
      const result = await correctUnitMileage(unitId, values);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Kilometraje de ${economicNumber} corregido`);
      form.reset({ mileage: "", date: today, reason: "" });
      onDone();
      router.refresh();
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl">Corregir kilometraje de {economicNumber}</DialogTitle>
        <DialogDescription>
          {mileage.last ? `Ahora marca ${describeMileage(mileage.last)}. ` : "Aún no tiene kilometraje registrado. "}
          Úsalo si se cambió el odómetro o hubo un error. Desde esa fecha, los servicios y entradas a taller se comparan
          con el valor nuevo. Queda registrado quién lo corrigió y por qué.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Controller
            name="mileage"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="min-w-0">
                <FieldLabel htmlFor="correct-mileage">Kilometraje correcto</FieldLabel>
                <Input
                  {...field}
                  id="correct-mileage"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Ej. 250000"
                  aria-invalid={fieldState.invalid}
                  className="h-11 min-w-0 bg-white text-base tabular-nums"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="date"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="min-w-0">
                <FieldLabel htmlFor="correct-date">Desde</FieldLabel>
                <Input
                  {...field}
                  id="correct-date"
                  type="date"
                  max={today}
                  aria-invalid={fieldState.invalid}
                  className="h-11 min-w-0 bg-white text-base"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>
        <Controller
          name="reason"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="correct-reason">Motivo</FieldLabel>
              <Textarea
                {...field}
                id="correct-reason"
                rows={2}
                maxLength={500}
                placeholder="Ej. Se cambió el tablero; el odómetro nuevo empezó en 0"
                aria-invalid={fieldState.invalid}
                className="text-base"
              />
              <FieldDescription>Se verá en la lista de correcciones de esta unidad.</FieldDescription>
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
          {isSubmitting ? "Guardando…" : "Corregir kilometraje"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CorrectionList({ corrections, withHeading }: { corrections: MileageCorrection[]; withHeading: boolean }) {
  return (
    <section aria-labelledby={withHeading ? "correcciones-km" : undefined} className="min-w-0">
      {withHeading && (
        <h3 id="correcciones-km" className="mb-2 font-semibold">
          Correcciones anteriores
        </h3>
      )}
      <ol className="grid gap-3">
        {corrections.map((c) => (
          <li key={c.id} className="min-w-0 rounded-lg border bg-white p-3">
            <p className="font-medium tabular-nums">
              <span className="whitespace-nowrap">Desde el {formatDate(c.date)}:</span>{" "}
              <span className="whitespace-nowrap">{formatKm(c.km)}</span>
              {c.previousKm !== null && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  (antes <span className="whitespace-nowrap">{formatKm(c.previousKm)}</span>)
                </span>
              )}
            </p>
            <p className="mt-1 whitespace-pre-line">{c.reason}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.author ?? "Usuario"}, {formatDateTime(c.createdAt)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
