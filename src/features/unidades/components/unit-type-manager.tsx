"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Pencil, Plus } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { createUnitType, renameUnitType, setUnitTypeActive } from "../actions";
import { unitTypeSchema, type UnitTypeInput } from "../schemas";
import type { UnitTypeInfo } from "../types";

/** "Con kilometraje · Largo en pies · Local o foráneo". */
function describeRules(t: Pick<UnitTypeInfo, "hasOdometer" | "hasLength" | "hasOperation">) {
  return [
    t.hasOdometer ? "Con kilometraje" : "Sin kilometraje",
    t.hasLength ? "Largo en pies" : null,
    t.hasOperation ? "Local o foránea" : "Con las camionetas",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Tipos de unidad en Catálogos (solo admin): alta con su letra y lo que lleva,
 * cambiar el nombre, y activar / desactivar. El interruptor cambia al instante y
 * se revierte si falla.
 */
export function UnitTypeManager({ types }: { types: UnitTypeInfo[] }) {
  const [dialog, setDialog] = useState<{ open: boolean; item?: UnitTypeInfo }>({ open: false });
  const [, startTransition] = useTransition();
  const [items, setOptimisticActive] = useOptimistic(types, (current, change: { key: string; active: boolean }) =>
    current.map((t) => (t.key === change.key ? { ...t, active: change.active } : t)),
  );
  const activeCount = items.filter((t) => t.active).length;

  function toggle(item: UnitTypeInfo, active: boolean) {
    startTransition(async () => {
      setOptimisticActive({ key: item.key, active });
      try {
        const result = await setUnitTypeActive(item.key, active);
        if (!result.ok) toast.error(result.error);
        else toast.success(`Se ${active ? "activó" : "desactivó"} ${item.name}`);
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <section aria-label="Tipos de unidad">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground">
          {activeCount} {activeCount === 1 ? "activo" : "activos"}
          {items.length > activeCount && ` · ${items.length - activeCount} inactivos`}
        </p>
        <Button size="touch" onClick={() => setDialog({ open: true })}>
          <Plus aria-hidden="true" />
          Nuevo tipo
        </Button>
      </div>

      <ul className="divide-y overflow-hidden rounded-lg border bg-white">
        {[...items]
          .sort((a, b) => Number(b.active) - Number(a.active))
          .map((item) => (
            <li key={item.key} className="flex min-h-16 items-center gap-3 px-4 py-2 sm:px-5">
              <span
                className={cn(
                  "w-12 shrink-0 font-heading text-xl font-bold tracking-wide text-brand-ink tabular-nums",
                  !item.active && "opacity-55",
                )}
                aria-label={`Letra ${item.prefix}`}
              >
                {item.prefix}-
              </span>
              <div className={cn("min-w-0 flex-1", !item.active && "opacity-55")}>
                <p className="text-base font-medium">
                  {item.name}
                  {!item.active && <span className="ml-2 text-sm font-normal text-muted-foreground">Inactivo</span>}
                </p>
                <p className="text-sm text-muted-foreground">{describeRules(item)}</p>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1">
                <span className="sr-only">{item.active ? `Desactivar ${item.name}` : `Activar ${item.name}`}</span>
                <Switch checked={item.active} onCheckedChange={(checked) => toggle(item, checked)} />
              </label>
              <Button
                variant="ghost"
                size="icon-touch"
                aria-label={`Cambiar el nombre de ${item.name}`}
                onClick={() => setDialog({ open: true, item })}
              >
                <Pencil />
              </Button>
            </li>
          ))}
      </ul>

      <UnitTypeDialog
        // key: cada vez que se abre, el formulario empieza limpio o con ese tipo.
        key={dialog.open ? (dialog.item?.key ?? "nuevo") : "cerrado"}
        item={dialog.item}
        open={dialog.open}
        onClose={() => setDialog({ open: false })}
      />
    </section>
  );
}

function RuleSwitch({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label htmlFor={id} className={cn("flex min-h-14 items-center gap-4 rounded-lg border bg-white px-4 py-3", !disabled && "cursor-pointer")}>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

function UnitTypeDialog({ item, open, onClose }: { item?: UnitTypeInfo; open: boolean; onClose: () => void }) {
  const isEdit = Boolean(item);
  const form = useForm<UnitTypeInput>({
    resolver: zodResolver(unitTypeSchema),
    defaultValues: item
      ? { name: item.name, prefix: item.prefix, hasOdometer: item.hasOdometer, hasLength: item.hasLength, hasOperation: item.hasOperation }
      : { name: "", prefix: "", hasOdometer: true, hasLength: false, hasOperation: true },
  });
  const prefix = useWatch({ control: form.control, name: "prefix" });

  async function onSubmit(values: UnitTypeInput) {
    try {
      if (item) {
        const result = await renameUnitType(item.key, { name: values.name });
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Ahora se llama ${values.name.trim()}`);
      } else {
        const result = await createUnitType(values);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Se agregó ${result.data.name}: sus unidades empiezan con ${result.data.prefix}-`);
      }
      onClose();
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const shownPrefix = (prefix || "X").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{isEdit ? `Cambiar el nombre de ${item?.name}` : "Nuevo tipo de unidad"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "La letra y lo que lleva ya no cambian: las unidades de este tipo ya están numeradas así."
                : "Después de agregarlo solo se puede cambiar el nombre. La letra y lo que lleva quedan fijos."}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="min-w-0">
                    <FieldLabel htmlFor="unit-type-name">Nombre</FieldLabel>
                    <Input
                      {...field}
                      id="unit-type-name"
                      autoComplete="off"
                      maxLength={40}
                      placeholder="Ej. Dolly"
                      aria-invalid={fieldState.invalid}
                      className="h-11 bg-white text-base"
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="prefix"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="min-w-0">
                    <FieldLabel htmlFor="unit-type-prefix">Letra</FieldLabel>
                    <Input
                      {...field}
                      id="unit-type-prefix"
                      autoComplete="off"
                      autoCapitalize="characters"
                      maxLength={3}
                      disabled={isEdit}
                      placeholder="Ej. D"
                      aria-invalid={fieldState.invalid}
                      className="h-11 bg-white font-heading text-lg font-bold tracking-wide uppercase"
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <FieldDescription className="-mt-3">
              Sus unidades se numeran {shownPrefix}-1, {shownPrefix}-2…
            </FieldDescription>

            <Controller
              name="hasOdometer"
              control={form.control}
              render={({ field }) => (
                <RuleSwitch
                  id="unit-type-km"
                  label="Lleva kilometraje"
                  description="Tiene odómetro: se pide el km en cada servicio. Si no, sus mantenimientos van solo por meses."
                  checked={field.value}
                  onChange={field.onChange}
                  disabled={isEdit}
                />
              )}
            />
            <Controller
              name="hasLength"
              control={form.control}
              render={({ field }) => (
                <RuleSwitch
                  id="unit-type-length"
                  label="Lleva largo en pies"
                  description="Como las cajas: 40, 50 o 53 pies."
                  checked={field.value}
                  onChange={field.onChange}
                  disabled={isEdit}
                />
              )}
            />
            <Controller
              name="hasOperation"
              control={form.control}
              render={({ field }) => (
                <RuleSwitch
                  id="unit-type-operation"
                  label="Es local o foránea"
                  description="Sale en Locales o en Foráneos. Si no, va en el grupo de Camionetas."
                  checked={field.value}
                  onChange={field.onChange}
                  disabled={isEdit}
                />
              )}
            />
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="touch" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Guardando…" : isEdit ? "Guardar nombre" : "Agregar tipo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
