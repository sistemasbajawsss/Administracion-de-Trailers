"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardPlus, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { formatKm } from "@/lib/utils/format";

import { createMaintenance, removeMaintenance, updateMaintenance } from "../actions";
import { maintenanceSchema, type MaintenanceInput } from "../schemas";
import {
  describeInterval,
  describeLeft,
  describeNext,
  registerMaintenanceHref as registerHref,
  type ApplyOutcome,
  type Maintenance,
  type MaintenanceTarget,
} from "../types";

import { MaintenanceLastTime } from "./maintenance-last-time";
import { MaintenanceStatusBadge } from "./maintenance-status-badge";
import { UnitMultiPicker } from "./unit-multi-picker";

type UnitMaintenanceProps = {
  unitId: string;
  economicNumber: string;
  /** Sin odómetro (cajas, dollys, góndolas…): solo mantenimientos por meses. */
  isBox: boolean;
  currentKm: number | null;
  items: Maintenance[];
  /** Las demás unidades, para "Aplicar también a" al agregar. */
  targets: MaintenanceTarget[];
  canEdit: boolean;
  /** "Registrar" en cada mantenimiento: abre el servicio con todo puesto (admin, unidad no retirada). */
  canRegister: boolean;
  today: string;
};

/**
 * Sección "Mantenimientos" de la ficha (5F): lo programado de la unidad, lo
 * urgente primero, con cuánto le falta. El admin agrega (a esta y, si quiere, a
 * otras unidades), edita y quita; el gerente solo ve.
 */
export function UnitMaintenance(props: UnitMaintenanceProps) {
  const { economicNumber, items, canEdit, canRegister } = props;
  const [editing, setEditing] = useState<Maintenance | "new" | null>(null);
  const [removing, setRemoving] = useState<Maintenance | null>(null);

  return (
    <section aria-labelledby="mantenimientos-unidad" className="mb-10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="mantenimientos-unidad" className="mb-1 text-2xl font-semibold">
            Mantenimientos
          </h2>
          <p className="text-sm text-muted-foreground">
            {items.length
              ? "Lo programado para esta unidad; lo más urgente primero."
              : canEdit
                ? `${economicNumber} no tiene mantenimientos programados. Al agregar uno puedes aplicarlo también a otras unidades.`
                : `${economicNumber} no tiene mantenimientos programados.`}
          </p>
        </div>
        {canEdit && (
          <Button size="touch" onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" />
            Agregar
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((m) => (
            <li key={m.id} className="flex min-w-0 flex-col gap-2 rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-heading text-lg font-semibold">{m.name}</p>
                <MaintenanceStatusBadge status={m.status} />
              </div>
              <p className="text-sm text-muted-foreground">{describeInterval(m)}</p>
              <p className="text-base">
                {describeNext(m)}
                {describeNext(m) ? ". " : ""}
                <span className={m.status === "vencido" ? "font-medium text-red-800" : undefined}>{describeLeft(m)}.</span>
              </p>
              <MaintenanceLastTime item={m} linkService />
              {(canRegister || canEdit) && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {canRegister && (
                    <Link href={registerHref(m)} className={cn(buttonVariants({ variant: "outline" }), "mr-1 min-h-11")}>
                      <ClipboardPlus aria-hidden="true" />
                      Registrar
                    </Link>
                  )}
                  {canEdit && (
                    <>
                      <Button variant="ghost" className="min-h-11" onClick={() => setEditing(m)}>
                        <Pencil aria-hidden="true" />
                        Editar
                      </Button>
                      <Button variant="ghost" className="min-h-11 text-red-800 hover:text-red-900" onClick={() => setRemoving(m)}>
                        <Trash2 aria-hidden="true" />
                        Quitar
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <>
          <MaintenanceDialog
            // key: cada vez que se abre, el formulario empieza con los datos de ese mantenimiento.
            key={editing === "new" ? "new" : (editing?.id ?? "closed")}
            {...props}
            item={editing === "new" ? null : editing}
            open={editing !== null}
            onClose={() => setEditing(null)}
          />
          <RemoveDialog {...props} item={removing} onClose={() => setRemoving(null)} />
        </>
      )}
    </section>
  );
}

function MaintenanceDialog({
  unitId,
  economicNumber,
  isBox,
  currentKm,
  today,
  targets,
  item,
  open,
  onClose,
}: UnitMaintenanceProps & { item: Maintenance | null; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const form = useForm<MaintenanceInput>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: item
      ? {
          name: item.name,
          everyKm: item.everyKm !== null ? String(item.everyKm) : "",
          everyMonths: item.everyMonths !== null ? String(item.everyMonths) : "",
          lastDate: item.lastDate,
          lastKm: item.lastKm !== null ? String(item.lastKm) : "",
          alsoUnitIds: [],
        }
      : {
          name: "",
          everyKm: "",
          everyMonths: "",
          lastDate: today,
          lastKm: currentKm !== null ? String(currentKm) : "",
          alsoUnitIds: [],
        },
  });
  const everyKm = useWatch({ control: form.control, name: "everyKm" });

  async function onSubmit(values: MaintenanceInput) {
    if (values.lastDate > today) {
      form.setError("lastDate", { message: "La fecha no puede ser futura" });
      return;
    }
    const clean = isBox ? { ...values, everyKm: "", lastKm: "" } : values;
    try {
      if (item) {
        const result = await updateMaintenance(item.id, unitId, clean);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Cambios guardados en ${clean.name}`);
      } else {
        const result = await createMaintenance(unitId, clean);
        if (!result.ok) return void toast.error(result.error);
        announce(clean.name.trim(), result.data.outcomes);
      }
      onClose();
      router.refresh();
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const inputClass = "h-11 min-w-0 bg-white text-base";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {item ? `Editar mantenimiento de ${economicNumber}` : `Nuevo mantenimiento de ${economicNumber}`}
            </DialogTitle>
            <DialogDescription>
              {isBox
                ? "Esta unidad no tiene odómetro: se programa cada cierto número de meses."
                : "Cada cuántos km, cada cuántos meses, o ambos (lo que pase primero)."}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="maintenance-name">Nombre</FieldLabel>
                  <Input
                    {...field}
                    id="maintenance-name"
                    autoComplete="off"
                    maxLength={100}
                    placeholder="Ej. Cambio de aceite"
                    aria-invalid={fieldState.invalid}
                    className={inputClass}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <div className={cn("grid grid-cols-1 gap-5", !isBox && "sm:grid-cols-2")}>
              {!isBox && (
                <Controller
                  name="everyKm"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="min-w-0">
                      <FieldLabel htmlFor="maintenance-km">Cada (km)</FieldLabel>
                      <Input
                        {...field}
                        id="maintenance-km"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Ej. 15000"
                        aria-invalid={fieldState.invalid}
                        className={`${inputClass} tabular-nums`}
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              )}
              <Controller
                name="everyMonths"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="min-w-0">
                    <FieldLabel htmlFor="maintenance-months">Cada (meses)</FieldLabel>
                    <Input
                      {...field}
                      id="maintenance-months"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Ej. 6"
                      aria-invalid={fieldState.invalid}
                      className={`${inputClass} tabular-nums`}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>

            <fieldset className="grid gap-3">
              <legend className="mb-3 text-sm font-medium">Última vez que se hizo</legend>
              <div className={cn("grid grid-cols-1 gap-5", !isBox && "sm:grid-cols-2")}>
                <Controller
                  name="lastDate"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="min-w-0">
                      <FieldLabel htmlFor="maintenance-date">Fecha</FieldLabel>
                      <Input
                        {...field}
                        id="maintenance-date"
                        type="date"
                        max={today}
                        aria-invalid={fieldState.invalid}
                        className={inputClass}
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                {!isBox && (
                  <Controller
                    name="lastKm"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} className="min-w-0">
                        <FieldLabel htmlFor="maintenance-last-km">Kilometraje</FieldLabel>
                        <Input
                          {...field}
                          id="maintenance-last-km"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="Ej. 250000"
                          aria-invalid={fieldState.invalid}
                          className={`${inputClass} tabular-nums`}
                        />
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />
                )}
              </div>
              <FieldDescription>
                Desde aquí se cuenta el siguiente.
                {!isBox && currentKm !== null && ` Hoy marca ${formatKm(currentKm)}.`}
              </FieldDescription>
            </fieldset>

            {!item && targets.length > 0 && (
              <Controller
                name="alsoUnitIds"
                control={form.control}
                render={({ field, fieldState }) => (
                  <fieldset className="grid min-w-0 gap-3">
                    <legend className="mb-1 text-sm font-medium">Aplicar también a</legend>
                    <FieldDescription className="-mt-1">
                      En las otras cuenta desde hoy y su kilometraje actual. Las que ya lo tienen se saltan.
                    </FieldDescription>
                    <UnitMultiPicker
                      units={targets}
                      value={field.value}
                      onChange={field.onChange}
                      byKm={!isBox && everyKm.trim() !== ""}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </fieldset>
                )}
              />
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="touch" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Guardando…" : item ? "Guardar cambios" : "Agregar mantenimiento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const numbers = (list: ApplyOutcome[]) => list.map((o) => o.economicNumber).join(", ");

/** Aviso de cómo quedó en cada unidad: dónde se agregó y cuáles se saltaron y por qué. */
function announce(name: string, outcomes: ApplyOutcome[]) {
  const [own, ...others] = outcomes;
  if (!own) return;
  if (others.length === 0) {
    toast.success(`${name} quedó programado para ${own.economicNumber}`);
    return;
  }
  const of = (...results: ApplyOutcome["result"][]) => others.filter((o) => results.includes(o.result));
  const added = of("agregado", "solo_meses");
  const lines = [
    of("solo_meses").length && `Solo por meses (sin odómetro o sin kilometraje): ${numbers(of("solo_meses"))}.`,
    of("ya_tiene").length && `Ya lo tenían: ${numbers(of("ya_tiene"))}.`,
    of("sin_kilometraje").length && `No se agregó, no tienen kilometraje: ${numbers(of("sin_kilometraje"))}.`,
    of("caja_solo_km").length && `No se agregó, no llevan kilometraje: ${numbers(of("caja_solo_km"))}.`,
    of("retirada").length && `De baja o vendidas: ${numbers(of("retirada"))}.`,
  ].filter(Boolean);
  const total = added.length + 1;
  toast.success(`${name} quedó programado en ${total} ${total === 1 ? "unidad" : "unidades"}`, {
    description: lines.length ? lines.join(" ") : undefined,
    duration: lines.length ? 12000 : undefined,
  });
}

function RemoveDialog({
  unitId,
  economicNumber,
  item,
  onClose,
}: UnitMaintenanceProps & { item: Maintenance | null; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function confirm() {
    if (!item) return;
    startTransition(async () => {
      try {
        const result = await removeMaintenance(item.id, unitId);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Se quitó ${item.name} de ${economicNumber}`);
        onClose();
        router.refresh();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <AlertDialog open={item !== null} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl">
            ¿Quitar {item?.name} de {economicNumber}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Deja de contarse y de avisar. Los servicios que ya se hicieron no cambian.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
          <Button size="touch" variant="destructive" onClick={confirm} disabled={isPending}>
            {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isPending ? "Quitando…" : "Quitar mantenimiento"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
