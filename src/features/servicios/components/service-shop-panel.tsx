"use client";

import { Wrench } from "lucide-react";
import { useState } from "react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils/format";
import { useToday } from "@/components/shared/use-today";

import { fallsInStay, NO_ENTRY_REASONS, OWN_SHOP_REASONS, type ServiceEditInput } from "../schemas";
import type { ServiceShopLink, ShopStay } from "../types";

/** Días completos entre dos fechas "aaaa-mm-dd" (sin zonas horarias). */
function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000));
}

export type ShopState = {
  /** Servicio de antes de la 5E: no se liga ni se marca (no se muestra nada). */
  legacy: boolean;
  /** Queda ligado a la estancia abierta de la unidad: se muestra la falla y la casilla. */
  linkedOpen: boolean;
  /** Al editar: sigue en una estancia que ya cerró. */
  linkedClosed: boolean;
  /** Se puede elegir "Se olvidó la entrada" (alta y unidad que no está en taller). */
  allowForgot: boolean;
  /** Falta motivo si no queda ligado (al editar, no si ya tenía uno). */
  needsReason: boolean;
};

/**
 * Qué pasa con el taller según la unidad y la fecha elegidas. Misma regla que
 * preparar_servicio (BD) y que updateService (servidor).
 */
export function shopState({
  stay,
  date,
  unitId,
  link,
  original,
}: {
  stay: ShopStay | null;
  date: string;
  unitId: string;
  /** Solo al editar. */
  link?: ServiceShopLink;
  original?: { unitId: string; date: string };
}): ShopState {
  if (!link || !original) {
    const linkedOpen = fallsInStay(stay, date);
    return { legacy: false, linkedOpen, linkedClosed: false, allowForgot: !stay, needsReason: true };
  }
  if (link.noEntry === null) {
    return { legacy: true, linkedOpen: false, linkedClosed: false, allowForgot: false, needsReason: false };
  }
  const unitChanged = unitId !== original.unitId;
  const keepsLink = !unitChanged && link.entryId !== null && !(stay?.entryId === link.entryId && date < stay.entryDate);
  const linksToStay = fallsInStay(stay, date) && (unitChanged || (link.entryId === null && date !== original.date));
  return {
    legacy: false,
    linkedOpen: linksToStay || (keepsLink && stay?.entryId === link.entryId),
    linkedClosed: keepsLink && stay?.entryId !== link.entryId,
    allowForgot: false,
    needsReason: !link.noEntryReason,
  };
}

type ReasonMode = (typeof NO_ENTRY_REASONS)[number] | "forgot" | "other" | null;

/**
 * Taller en el formulario de servicio (5E, D13):
 * - En taller: falla y casilla "La unidad sale de taller con este servicio".
 * - Sin entrada: por qué (botones rápidos, "Se olvidó la entrada" u "Otro…").
 */
export function ServiceShopPanel({
  form,
  stay,
  state,
  today: serverToday,
}: {
  form: UseFormReturn<ServiceEditInput>;
  stay: ShopStay | null;
  state: ShopState;
  today: string;
}) {
  const today = useToday(serverToday);
  const date = useWatch({ control: form.control, name: "date" });
  const [reason, forgot] = useWatch({ control: form.control, name: ["noEntryReason", "forgotEntry"] });
  const [mode, setMode] = useState<ReasonMode>(() =>
    forgot
      ? "forgot"
      : (OWN_SHOP_REASONS as readonly string[]).includes(reason)
        ? "Mantenimiento taller Realso" // también el nombre anterior, "Mantenimiento en patio"
        : (NO_ENTRY_REASONS as readonly string[]).includes(reason)
          ? (reason as ReasonMode)
          : reason
            ? "other"
            : null,
  );

  if (state.legacy) return null;

  const leavesShopSwitch = (label: string) => (
    <Controller
      name="leavesShop"
      control={form.control}
      render={({ field }) => (
        <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 py-2">
          <Switch checked={field.value} onCheckedChange={field.onChange} />
          <span className="font-medium">{label}</span>
        </label>
      )}
    />
  );

  if (state.linkedOpen && stay) {
    const days = daysBetween(stay.entryDate, today);
    return (
      <section aria-label="Unidad en taller" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <p className="flex items-center gap-2 font-heading text-lg font-semibold">
          <Wrench className="size-5 shrink-0" aria-hidden="true" />
          En taller desde el {formatDate(stay.entryDate)}
          <span className="font-normal whitespace-nowrap">· {days === 0 ? "hoy" : days === 1 ? "1 día" : `${days} días`}</span>
        </p>
        <p className="mt-1 whitespace-pre-line">
          <span className="text-sm text-amber-900/80">Falla: </span>
          {stay.fault}
        </p>
        {leavesShopSwitch("La unidad sale de taller con este servicio")}
        <p className="mt-1.5 text-sm text-amber-900/80">Desmárcala si todavía le faltan otros servicios.</p>
      </section>
    );
  }

  if (state.linkedClosed) {
    return (
      <p className="rounded-xl border bg-white px-4 py-3 text-sm text-muted-foreground">
        Este servicio pertenece a una estancia en taller que ya terminó.
      </p>
    );
  }

  const pick = (next: ReasonMode) => {
    setMode(next);
    form.setValue("forgotEntry", next === "forgot", { shouldDirty: true });
    form.setValue("leavesShop", next === "forgot", { shouldDirty: true });
    form.setValue("noEntryReason", next && next !== "forgot" && next !== "other" ? next : "", { shouldDirty: true });
    form.clearErrors(["noEntryReason", "forgotEntryDate", "forgotEntryFault"]);
  };
  const chip =
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-brand-ink aria-pressed:bg-brand-ink aria-pressed:text-white";
  const reasonError = form.formState.errors.noEntryReason;

  return (
    <section aria-labelledby="sin-entrada" className="rounded-xl border bg-white p-4">
      <p id="sin-entrada" className="font-heading text-lg font-semibold">
        {stay
          ? `Está en taller desde el ${formatDate(stay.entryDate)}, pero este servicio es de antes`
          : "Esta unidad no tiene entrada a taller"}
      </p>
      <p className="text-sm text-muted-foreground">
        {state.needsReason ? "¿Por qué? El servicio se guardará igual." : "El servicio se guardará igual. Puedes corregir el motivo."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Motivo">
        {NO_ENTRY_REASONS.map((option) => (
          <button key={option} type="button" aria-pressed={mode === option} onClick={() => pick(option)} className={chip}>
            {option}
          </button>
        ))}
        {state.allowForgot && (
          <button type="button" aria-pressed={mode === "forgot"} onClick={() => pick("forgot")} className={chip}>
            Se olvidó la entrada
          </button>
        )}
        <button type="button" aria-pressed={mode === "other"} onClick={() => pick("other")} className={chip}>
          Otro…
        </button>
      </div>

      {mode === "other" && (
        <Controller
          name="noEntryReason"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="mt-3">
              <FieldLabel htmlFor="noEntryReason">Motivo</FieldLabel>
              <Textarea
                {...field}
                id="noEntryReason"
                rows={2}
                maxLength={300}
                placeholder="Ej. Se compraron llantas para tenerlas de repuesto"
                aria-invalid={fieldState.invalid}
                className="bg-white text-base"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}
      {mode !== "other" && mode !== "forgot" && reasonError && <FieldError className="mt-2" errors={[reasonError]} />}

      {mode === "forgot" && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-950">Se registra la entrada a taller con este servicio.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <Controller
              name="forgotEntryDate"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="forgotEntryDate">¿Cuándo entró a taller?</FieldLabel>
                  <Input
                    {...field}
                    id="forgotEntryDate"
                    type="date"
                    max={date || today}
                    aria-invalid={fieldState.invalid}
                    className="h-12 min-w-0 bg-white text-base"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="forgotEntryFault"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="forgotEntryFault">Falla</FieldLabel>
                  <Textarea
                    {...field}
                    id="forgotEntryFault"
                    rows={2}
                    maxLength={1000}
                    placeholder="Ej. No frenaba bien"
                    aria-invalid={fieldState.invalid}
                    className="bg-white text-base"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </div>
          {leavesShopSwitch("Ya salió de taller con este servicio")}
        </div>
      )}
    </section>
  );
}
