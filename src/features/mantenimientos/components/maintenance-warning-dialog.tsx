"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatKm } from "@/lib/utils/format";

import { removeUnitWarning, setGeneralWarning, setUnitWarning } from "../actions";
import { generalWarningSchema, unitWarningSchema, type GeneralWarningInput, type UnitWarningInput } from "../schemas";
import type { MaintenanceWarnings, UnitWarning } from "../types";

import { UnitMultiPicker } from "./unit-multi-picker";

const OFFLINE = "No se pudo conectar. Revisa tu internet e inténtalo de nuevo.";
const unitsLabel = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;
const inputClass = "h-11 min-w-0 bg-white text-base tabular-nums";

/**
 * Ventana "Aviso de kilometraje" de Mantenimientos (5J, solo admin): cuántos km
 * antes de que le toque se marca "Programar servicio". Uno general para todas y,
 * si se quiere, uno propio para ciertas unidades. Lo de 1,000 km ("Realizar
 * ahora") y los días de los mantenimientos por meses son fijos.
 */
export function MaintenanceWarningDialog({
  open,
  onOpenChange,
  warnings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warnings: MaintenanceWarnings;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Aviso de kilometraje</DialogTitle>
          <DialogDescription>
            Cuántos km antes de que le toque el mantenimiento se marca &quot;Programar servicio&quot;, para hacerlo antes de
            que la unidad salga de viaje. Con 1,000 km o menos siempre es &quot;Realizar ahora&quot;.
          </DialogDescription>
        </DialogHeader>

        {/* key: empezar de cero cuando cambian los datos del servidor. */}
        <GeneralForm key={`general-${warnings.generalKm}`} generalKm={warnings.generalKm} />
        <OwnList units={warnings.units} generalKm={warnings.generalKm} />
        <UnitForm key={`units-${warnings.units.map((u) => `${u.unitId}:${u.km}`).join(",")}`} warnings={warnings} />
      </DialogContent>
    </Dialog>
  );
}

function GeneralForm({ generalKm }: { generalKm: number }) {
  const router = useRouter();
  const form = useForm<GeneralWarningInput>({
    resolver: zodResolver(generalWarningSchema),
    defaultValues: { km: String(generalKm) },
  });

  async function onSubmit(values: GeneralWarningInput) {
    try {
      const result = await setGeneralWarning(values);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Aviso general guardado: ${formatKm(result.data.km)} antes`);
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    }
  }

  const busy = form.formState.isSubmitting;
  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="rounded-xl border bg-white p-4">
      <Controller
        name="km"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="warning-general" className="text-base font-semibold">
              Aviso general (km)
            </FieldLabel>
            <FieldDescription>Para todas las unidades, menos las que tienen su propio aviso.</FieldDescription>
            <div className="flex flex-wrap gap-2">
              <Input
                {...field}
                id="warning-general"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej. 4000"
                aria-invalid={fieldState.invalid}
                className={`${inputClass} w-40 flex-1 sm:flex-none`}
              />
              <Button type="submit" size="touch" disabled={busy || !form.formState.isDirty}>
                {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Guardar
              </Button>
            </div>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </form>
  );
}

function OwnList({ units, generalKm }: { units: UnitWarning[]; generalKm: number }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(unit: UnitWarning) {
    setRemoving(unit.unitId);
    try {
      const result = await removeUnitWarning(unit.unitId);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`${unit.economicNumber} vuelve al aviso general (${formatKm(generalKm)})`);
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section aria-labelledby="avisos-propios" className="min-w-0">
      <h3 id="avisos-propios" className="mb-2 text-base font-semibold">
        Unidades con aviso propio
      </h3>
      {units.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguna: todas usan el aviso general.</p>
      ) : (
        <ul className="max-h-[min(22rem,40dvh)] divide-y overflow-y-auto rounded-xl border bg-white">
          {units.map((unit) => (
            <li key={unit.unitId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className="font-heading text-xl font-bold tracking-wide text-brand-ink tabular-nums">{unit.economicNumber}</span>
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">{unit.typeName}</span>
              <span className="font-medium whitespace-nowrap tabular-nums">{formatKm(unit.km)}</span>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={removing !== null}
                onClick={() => remove(unit)}
              >
                {removing === unit.unitId && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UnitForm({ warnings }: { warnings: MaintenanceWarnings }) {
  const router = useRouter();
  const form = useForm<UnitWarningInput>({
    resolver: zodResolver(unitWarningSchema),
    defaultValues: { km: "", unitIds: [] },
  });
  const chosen = useWatch({ control: form.control, name: "unitIds" });
  const withOwn = new Set(warnings.units.map((u) => u.unitId));
  const replacing = chosen.filter((id) => withOwn.has(id)).length;

  async function onSubmit(values: UnitWarningInput) {
    try {
      const result = await setUnitWarning(values);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Aviso de ${formatKm(result.data.km)} puesto a ${unitsLabel(result.data.count)}`);
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    }
  }

  if (warnings.targets.length === 0) return null;

  const busy = form.formState.isSubmitting;
  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 rounded-xl border bg-muted/30 p-4">
      <div>
        <h3 className="text-base font-semibold">Poner aviso propio</h3>
        <p className="text-sm text-muted-foreground">
          Para las unidades elegidas, en lugar del general. Solo unidades con kilometraje: las que no lo llevan se avisan
          30 días antes.
        </p>
      </div>

      <Controller
        name="unitIds"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <UnitMultiPicker units={warnings.targets} value={field.value} onChange={field.onChange} byKm={false} standalone />
            {replacing > 0 && (
              <FieldDescription>
                {replacing === 1 ? "Una ya tiene su aviso propio: se cambia." : `${replacing} ya tienen su aviso propio: se cambia.`}
              </FieldDescription>
            )}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller
        name="km"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="warning-units">Aviso (km)</FieldLabel>
            <Input
              {...field}
              id="warning-units"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej. 6000"
              aria-invalid={fieldState.invalid}
              className={`${inputClass} w-40`}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Button type="submit" size="touch" disabled={busy} className="w-full sm:w-auto sm:justify-self-start">
        {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        {chosen.length ? `Poner aviso a ${unitsLabel(chosen.length)}` : "Poner aviso"}
      </Button>
    </form>
  );
}
