"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";

import { useGoBack } from "@/components/shared/go-back";
import { useRemountAfterSave } from "@/components/shared/use-remount-after-save";
import { useUnsavedChanges } from "@/components/shared/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { UnitPicker } from "@/features/servicios/components/unit-picker";
import type { UnitOption } from "@/features/servicios/types";

import { createTicket } from "../actions";
import { createTicketSchema, type CreateTicketInput } from "../schemas";
import { PRIORITY_HINTS, PRIORITY_LABELS, TICKET_PRIORITIES, type TicketPriority } from "../types";

type TicketFormProps = { units: UnitOption[]; initialUnitId: string };

const PRIORITY_ACTIVE: Record<TicketPriority, string> = {
  urgente: "border-red-700 bg-red-700 text-white",
  normal: "border-amber-500 bg-amber-100 text-amber-950",
  baja: "border-slate-500 bg-slate-100 text-slate-900",
};

/** Después de guardar, volver a esta pantalla muestra un formulario nuevo (ver useRemountAfterSave). */
export function TicketForm(props: TicketFormProps) {
  const { key, markSaved } = useRemountAfterSave();
  return <TicketFormBody key={key} {...props} onSaved={markSaved} />;
}

/** Levantar un ticket de taller (admin y gerente): unidad, falla y prioridad. Llega a todos los capturistas. */
function TicketFormBody({ units, initialUnitId, onSaved }: TicketFormProps & { onSaved: () => void }) {
  const goBack = useGoBack();
  const [saved, setSaved] = useState(false);

  const form = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { unitId: initialUnitId, fault: "", priority: "normal" },
  });

  async function onSubmit(values: CreateTicketInput) {
    const number = units.find((u) => u.id === values.unitId)?.economicNumber ?? "la unidad";
    try {
      const result = await createTicket(values);
      if (!result.ok) return void toast.error(result.error);
      setSaved(true);
      onSaved();
      toast.success(`Ticket de ${number} enviado a los capturistas`);
      goBack("/tickets", { refresh: true });
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const { confirmLeave, leaveDialog } = useUnsavedChanges(form.formState.isDirty && !saved && !isSubmitting, onSaved);

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
                title="¿Qué unidad necesita taller?"
              />
              <FieldDescription>No salen las que ya están en taller o ya tienen un ticket pendiente.</FieldDescription>
              <FieldError id="unitId-error" errors={[fieldState.error]} />
            </Field>
          )}
        />

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
                placeholder="Ej. Tira aceite por la parte de abajo del motor"
                aria-invalid={fieldState.invalid}
                className="bg-white text-base"
              />
              <FieldDescription>Al aceptar el ticket, esta falla pasa a su entrada a taller.</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          name="priority"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel id="priority-label">Prioridad</FieldLabel>
              <div role="radiogroup" aria-labelledby="priority-label" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TICKET_PRIORITIES.map((priority) => {
                  const active = field.value === priority;
                  return (
                    <button
                      key={priority}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => field.onChange(priority)}
                      className={cn(
                        "flex min-h-16 min-w-0 flex-col items-start justify-center rounded-xl border-2 px-4 py-2 text-left outline-none transition-colors",
                        "focus-visible:ring-3 focus-visible:ring-ring/50",
                        active ? PRIORITY_ACTIVE[priority] : "border-input bg-white hover:border-brand-ink/40",
                      )}
                    >
                      <span className="text-base font-semibold">{PRIORITY_LABELS[priority]}</span>
                      <span className={cn("text-sm", active && priority === "urgente" ? "text-white/90" : "text-muted-foreground")}>
                        {PRIORITY_HINTS[priority]}
                      </span>
                    </button>
                  );
                })}
              </div>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="touch" onClick={() => confirmLeave(() => goBack("/tickets"))}>
            Cancelar
          </Button>
          <Button type="submit" size="touch" disabled={isSubmitting || saved} className="sm:min-w-44">
            {(isSubmitting || saved) && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Enviando…" : saved ? "Enviado" : "Enviar ticket"}
          </Button>
        </div>
      </FieldGroup>
      {leaveDialog}
    </form>
  );
}
