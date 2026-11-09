"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDate, formatKm } from "@/lib/utils/format";

import { copyMaintenance, createMaintenance, removeMaintenance, updateMaintenance } from "../actions";
import { maintenanceSchema, type MaintenanceInput } from "../schemas";
import {
  describeInterval,
  describeLeft,
  describeNext,
  MAINTENANCE_STATUS_LABELS,
  type Maintenance,
  type MaintenanceSource,
  type MaintenanceStatus,
} from "../types";

const STATUS_STYLES: Record<MaintenanceStatus, string> = {
  vencido: "border-red-500/40 bg-red-50 text-red-800",
  por_vencer: "border-amber-500/40 bg-amber-50 text-amber-800",
  al_corriente: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  sin_kilometraje: "border-border bg-muted text-muted-foreground",
};

export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status],
      )}
    >
      {MAINTENANCE_STATUS_LABELS[status]}
    </span>
  );
}

type UnitMaintenanceProps = {
  unitId: string;
  economicNumber: string;
  /** Las cajas solo llevan mantenimientos por meses. */
  isBox: boolean;
  currentKm: number | null;
  items: Maintenance[];
  sources: MaintenanceSource[];
  canEdit: boolean;
  today: string;
};

/**
 * Sección "Mantenimientos" de la ficha (5F): lo programado de la unidad, lo
 * urgente primero, con cuánto le falta. El admin agrega, edita, quita y copia de
 * otra unidad; el gerente solo ve.
 */
export function UnitMaintenance(props: UnitMaintenanceProps) {
  const { economicNumber, items, sources, canEdit } = props;
  const [editing, setEditing] = useState<Maintenance | "new" | null>(null);
  const [removing, setRemoving] = useState<Maintenance | null>(null);
  const [copying, setCopying] = useState(false);

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
                ? `${economicNumber} no tiene mantenimientos programados. Agrega uno o cópialos de otra unidad.`
                : `${economicNumber} no tiene mantenimientos programados.`}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {sources.length > 0 && (
              <Button variant="outline" size="touch" onClick={() => setCopying(true)}>
                <Copy aria-hidden="true" />
                Copiar de otra unidad
              </Button>
            )}
            <Button size="touch" onClick={() => setEditing("new")}>
              <Plus aria-hidden="true" />
              Agregar
            </Button>
          </div>
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
              <p className="text-sm text-muted-foreground">
                Última vez: {formatDate(m.lastDate)}
                {m.lastKm !== null && <span className="whitespace-nowrap">, a los {formatKm(m.lastKm)}</span>}
              </p>
              {canEdit && (
                <div className="-mx-2 mt-1 flex flex-wrap gap-1">
                  <Button variant="ghost" className="min-h-11" onClick={() => setEditing(m)}>
                    <Pencil aria-hidden="true" />
                    Editar
                  </Button>
                  <Button variant="ghost" className="min-h-11 text-red-800 hover:text-red-900" onClick={() => setRemoving(m)}>
                    <Trash2 aria-hidden="true" />
                    Quitar
                  </Button>
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
          <CopyDialog {...props} open={copying} onClose={() => setCopying(false)} />
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
        }
      : { name: "", everyKm: "", everyMonths: "", lastDate: today, lastKm: currentKm !== null ? String(currentKm) : "" },
  });

  async function onSubmit(values: MaintenanceInput) {
    if (values.lastDate > today) {
      form.setError("lastDate", { message: "La fecha no puede ser futura" });
      return;
    }
    const clean = isBox ? { ...values, everyKm: "", lastKm: "" } : values;
    try {
      const result = item ? await updateMaintenance(item.id, unitId, clean) : await createMaintenance(unitId, clean);
      if (!result.ok) return void toast.error(result.error);
      toast.success(item ? `Cambios guardados en ${clean.name}` : `${clean.name} quedó programado para ${economicNumber}`);
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
                ? "Las cajas no tienen odómetro: se programan cada cierto número de meses."
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

function CopyDialog({
  unitId,
  economicNumber,
  isBox,
  sources,
  open,
  onClose,
}: UnitMaintenanceProps & { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [sourceUnitId, setSourceUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const items = Object.fromEntries(
    sources.map((s) => [s.unitId, `${s.economicNumber} (${s.count} ${s.count === 1 ? "mantenimiento" : "mantenimientos"})`]),
  );

  function close() {
    setSourceUnitId("");
    setError(null);
    onClose();
  }

  function confirm() {
    if (!sourceUnitId) return setError("Elige de qué unidad copiar");
    startTransition(async () => {
      try {
        const result = await copyMaintenance(unitId, { sourceUnitId });
        if (!result.ok) return void toast.error(result.error);
        const n = result.data.copied;
        if (n === 0) toast.info(`${economicNumber} ya tenía todos los mantenimientos de esa unidad`);
        else toast.success(`Se ${n === 1 ? "copió 1 mantenimiento" : `copiaron ${n} mantenimientos`} a ${economicNumber}`);
        close();
        router.refresh();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Copiar mantenimientos a {economicNumber}</DialogTitle>
          <DialogDescription>
            Se copian los que {economicNumber} aún no tiene, contando desde hoy
            {isBox ? ". A una caja solo pasan los que van por meses." : " y su kilometraje actual."} Después puedes
            ajustar cada uno.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="copy-source">Copiar de</FieldLabel>
          <Select
            items={items}
            value={sourceUnitId || null}
            onValueChange={(value) => {
              setSourceUnitId(String(value ?? ""));
              setError(null);
            }}
          >
            <SelectTrigger id="copy-source" className="h-11 w-full bg-white text-base">
              <SelectValue placeholder="Elige la unidad" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.unitId} value={s.unitId} className="min-h-11">
                  {items[s.unitId]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" size="touch" onClick={close}>
            Cancelar
          </Button>
          <Button size="touch" onClick={confirm} disabled={isPending}>
            {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isPending ? "Copiando…" : "Copiar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
