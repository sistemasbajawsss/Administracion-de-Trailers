"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { createCatalogItem, findSimilarCatalogAction, updateCatalogItem } from "../actions";
import { catalogItemSchema, type CatalogItemInput } from "../schemas";
import { CATALOG_LABELS, isMergeableKind, type CatalogItem, type CatalogKind, type SimilarCatalogItem } from "../types";

function toFormValues(item?: CatalogItem): CatalogItemInput {
  return { name: item?.name ?? "", phone: item?.phone ?? "", notes: item?.notes ?? "" };
}

/**
 * Alta y edición de un renglón de catálogo. Sirve también como "alta rápida"
 * de proveedor desde otras pantallas (onSaved recibe el nuevo id y nombre).
 */
export function CatalogItemDialog({
  kind,
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  kind: CatalogKind;
  item?: CatalogItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (saved: { id: string; name: string }) => void;
}) {
  const labels = CATALOG_LABELS[kind];
  const isEdit = Boolean(item);

  const form = useForm<CatalogItemInput>({
    resolver: zodResolver(catalogItemSchema),
    defaultValues: toFormValues(item),
  });

  // Parecidos que ya existen (5I): se muestran una vez por nombre; si se vuelve a
  // tocar "Agregar" con el mismo nombre, se agrega.
  const [similar, setSimilar] = useState<{ name: string; items: SimilarCatalogItem[] } | null>(null);

  // Al abrir, cargar los datos del renglón (o limpiar para un alta nueva).
  useEffect(() => {
    if (open) form.reset(toFormValues(item));
  }, [open, item, form]);

  /** Al cerrar, los parecidos se olvidan: la siguiente alta vuelve a buscar. */
  function close() {
    setSimilar(null);
    onOpenChange(false);
  }

  function pickExisting(existing: SimilarCatalogItem) {
    onSaved?.(existing);
    toast.success(`Se eligió ${existing.name}`);
    close();
  }

  async function onSubmit(values: CatalogItemInput) {
    try {
      // 5I: antes de dar de alta un proveedor o taller, los que ya existen con nombre parecido.
      if (!item && isMergeableKind(kind) && similar?.name !== values.name.trim()) {
        const found = await findSimilarCatalogAction(kind, values.name);
        if (found.ok && found.data.length > 0) {
          setSimilar({ name: values.name.trim(), items: found.data });
          return;
        }
      }
      if (item) {
        const result = await updateCatalogItem(kind, item.id, values);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Cambios guardados");
        onSaved?.({ id: item.id, name: values.name });
      } else {
        const result = await createCatalogItem(kind, values);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Se agregó ${result.data.name}`);
        onSaved?.(result.data);
      }
      close();
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const title = isEdit ? `Editar ${labels.singular}` : `Nuevo ${labels.singular}`;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {/* stopPropagation: en React el submit sube por el árbol aunque el diálogo esté en
            un portal; dentro del formulario de servicio (alta rápida de proveedor) también
            enviaba el servicio. */}
        <form
          noValidate
          onSubmit={(event) => {
            event.stopPropagation();
            void form.handleSubmit(onSubmit)(event);
          }}
          className="grid gap-5"
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {kind === "categorias" ? title.replace("Nuevo", "Nueva") : title}
            </DialogTitle>
            <DialogDescription>{labels.empty}</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${kind}-name`}>Nombre</FieldLabel>
                  <Input
                    {...field}
                    onChange={(event) => {
                      field.onChange(event);
                      // Otro nombre: se vuelve a buscar parecidos al agregar.
                      setSimilar(null);
                    }}
                    id={`${kind}-name`}
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                    className="h-11 text-base"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            {labels.hasPhone && (
              <Controller
                name="phone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${kind}-phone`}>Teléfono (opcional)</FieldLabel>
                    <Input
                      {...field}
                      id={`${kind}-phone`}
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                      className="h-11 text-base"
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            )}
            {labels.hasNotes && (
              <Controller
                name="notes"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${kind}-notes`}>Notas (opcional)</FieldLabel>
                    <Textarea {...field} id={`${kind}-notes`} rows={3} aria-invalid={fieldState.invalid} className="text-base" />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            )}
          </FieldGroup>

          {similar && (
            <div role="status" className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm text-amber-950">
                Ya {similar.items.length === 1 ? "hay uno" : "hay varios"} con un nombre parecido a &ldquo;
                <strong className="font-semibold">{similar.name}</strong>&rdquo;.{" "}
                {onSaved
                  ? "Si es el mismo, elígelo para no repetirlo."
                  : `Si es el mismo, no lo agregues: usa el que ya existe.`}
              </p>
              <ul className="grid gap-2">
                {similar.items.map((existing) => (
                  <li key={existing.id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-base font-medium">{existing.name}</span>
                    {onSaved && (
                      <Button type="button" variant="outline" size="touch" onClick={() => pickExisting(existing)}>
                        Usar este
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-amber-950">
                Si es otro, toca &ldquo;Agregar de todos modos&rdquo;.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" size="touch" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Guardando…" : isEdit ? "Guardar cambios" : similar ? "Agregar de todos modos" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
