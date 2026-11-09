"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { useGoBack } from "@/components/shared/go-back";
import { useRemountAfterSave } from "@/components/shared/use-remount-after-save";
import { useUnsavedChanges } from "@/components/shared/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UnitPicker } from "@/features/servicios/components/unit-picker";
import type { UnitOption } from "@/features/servicios/types";
import { describeMileage, mileageIssue } from "@/lib/utils/mileage";

import { registerShopEntry } from "../actions";
import { shopEntrySchema, type ShopEntryInput } from "../schemas";

type ShopEntryFormProps = { units: UnitOption[]; today: string; initialUnitId: string };

/** Después de guardar, volver a esta pantalla muestra un formulario nuevo (ver useRemountAfterSave). */
export function ShopEntryForm(props: ShopEntryFormProps) {
  const { key, markSaved } = useRemountAfterSave();
  return <ShopEntryFormBody key={key} {...props} onSaved={markSaved} />;
}

/** Entrada a taller: unidad, fecha (hoy por defecto) y la falla. La unidad pasa a En taller. */
function ShopEntryFormBody({ units, today, initialUnitId, onSaved }: ShopEntryFormProps & { onSaved: () => void }) {
  const goBack = useGoBack();
  const [saved, setSaved] = useState(false);

  const form = useForm<ShopEntryInput>({
    resolver: zodResolver(shopEntrySchema),
    defaultValues: { unitId: initialUnitId, date: today, mileage: "", fault: "" },
  });

  const unitId = useWatch({ control: form.control, name: "unitId" });
  const selectedUnit = units.find((u) => u.id === unitId);
  const isBox = selectedUnit?.type === "caja";
  const lastMileage = selectedUnit?.mileage ?? null;

  async function onSubmit(values: ShopEntryInput) {
    if (values.date > today) {
      form.setError("date", { message: "La fecha de entrada no puede ser futura" });
      return;
    }
    // Kilometraje (5F): obligatorio salvo en cajas (el servidor y la BD lo revisan otra vez).
    const kmProblem = isBox ? null : mileageIssue(values.mileage, { required: true, last: lastMileage, date: values.date });
    if (kmProblem) {
      form.setError("mileage", { message: kmProblem });
      form.setFocus("mileage");
      return;
    }
    if (isBox) values = { ...values, mileage: "" };
    const number = units.find((u) => u.id === values.unitId)?.economicNumber ?? "La unidad";
    try {
      const result = await registerShopEntry(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved(true);
      onSaved();
      toast.success(`${number} entró a taller`);
      goBack("/taller", { refresh: true });
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const confirmLeave = useUnsavedChanges(form.formState.isDirty && !saved && !isSubmitting);

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl">
      <FieldGroup className="gap-8">
        <Controller
          name="unitId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="unitId" className="font-heading text-xl">Unidad</FieldLabel>
              <UnitPicker
                units={units}
                value={field.value}
                onChange={(unit) => field.onChange(unit.id)}
                invalid={fieldState.invalid}
                title="¿Qué unidad entra a taller?"
              />
              <FieldError id="unitId-error" errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Controller
            name="date"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="min-w-0">
                <FieldLabel htmlFor="date">Fecha de entrada</FieldLabel>
                <Input
                  {...field}
                  id="date"
                  type="date"
                  max={today}
                  aria-invalid={fieldState.invalid}
                  className="h-11 min-w-0 bg-white text-base"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {!isBox && (
            <Controller
              name="mileage"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="min-w-0">
                  <FieldLabel htmlFor="mileage">Kilometraje</FieldLabel>
                  <Input
                    {...field}
                    id="mileage"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Ej. 250000"
                    aria-invalid={fieldState.invalid}
                    aria-required
                    className="h-11 min-w-0 bg-white text-base tabular-nums"
                  />
                  {lastMileage && (
                    <FieldDescription>Último registrado: {describeMileage(lastMileage)}</FieldDescription>
                  )}
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}
        </div>

        <Controller
          name="fault"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="fault">Falla</FieldLabel>
              <Textarea
                {...field}
                id="fault"
                rows={4}
                maxLength={1000}
                placeholder="Ej. No frena bien de la parte trasera; hace ruido al frenar"
                aria-invalid={fieldState.invalid}
                className="bg-white text-base"
              />
              <FieldDescription>Qué tiene o por qué entra. Se verá en Taller y al registrar su servicio.</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="touch"
            onClick={() => confirmLeave() && goBack("/taller")}
          >
            Cancelar
          </Button>
          <Button type="submit" size="touch" disabled={isSubmitting || saved} className="sm:min-w-44">
            {(isSubmitting || saved) && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Guardando…" : saved ? "Guardado" : "Registrar entrada"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
