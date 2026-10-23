"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
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

import { createCatalogItem, updateCatalogItem } from "../actions";
import { catalogItemSchema, type CatalogItemInput } from "../schemas";
import { CATALOG_LABELS, type CatalogItem, type CatalogKind } from "../types";

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

  // Al abrir, cargar los datos del renglón (o limpiar para un alta nueva).
  useEffect(() => {
    if (open) form.reset(toFormValues(item));
  }, [open, item, form]);

  async function onSubmit(values: CatalogItemInput) {
    try {
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
      onOpenChange(false);
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const title = isEdit ? `Editar ${labels.singular}` : `Nuevo ${labels.singular}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
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

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="touch" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
