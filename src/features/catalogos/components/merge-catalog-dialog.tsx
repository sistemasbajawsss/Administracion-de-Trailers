"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { getMergeUsage, mergeCatalogItem } from "../actions";
import { mergeCatalogSchema, type MergeCatalogInput } from "../schemas";
import { CATALOG_LABELS, type CatalogItem, type MergeableKind } from "../types";

const servicesText = (n: number) => (n === 1 ? "1 servicio" : `${n} servicios`);

/**
 * Unir un proveedor o taller repetido en otro (5I, D18). Dice exactamente qué
 * pasa: sus servicios pasan al que se queda (con el motivo en la línea de
 * cambios de cada uno) y el repetido se desactiva. El total de Reportes no cambia.
 */
export function MergeCatalogDialog({
  kind,
  item,
  candidates,
  onOpenChange,
}: {
  kind: MergeableKind;
  /** El repetido (el que se va a desactivar); null = cerrado. */
  item: CatalogItem | null;
  /** Activos del mismo catálogo con los que se puede unir. */
  candidates: CatalogItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const labels = CATALOG_LABELS[kind];
  const [usage, setUsage] = useState<number | null>(null);
  const [usageError, setUsageError] = useState(false);

  const form = useForm<MergeCatalogInput>({
    resolver: zodResolver(mergeCatalogSchema),
    defaultValues: { targetId: "", reason: "" },
  });

  // Se monta de nuevo para cada renglón (key en CatalogManager): empieza limpio.
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    getMergeUsage(kind, item.id)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setUsage(result.data);
        else setUsageError(true);
      })
      .catch(() => !cancelled && setUsageError(true));
    return () => {
      cancelled = true;
    };
  }, [item, kind]);

  const options = candidates.filter((c) => c.id !== item?.id);
  const targetId = useWatch({ control: form.control, name: "targetId" });
  const target = options.find((c) => c.id === targetId);
  const destination = target ? `a ${target.name}` : "al que elijas";

  async function onSubmit(values: MergeCatalogInput) {
    if (!item) return;
    try {
      const result = await mergeCatalogItem(kind, item.id, values);
      if (!result.ok) return void toast.error(result.error);
      toast.success(
        `Se unió ${item.name} con ${target?.name ?? "el que elegiste"}: ${servicesText(result.data.services)} ${result.data.services === 1 ? "cambió" : "cambiaron"}`,
      );
      onOpenChange(false);
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !isSubmitting && onOpenChange(open)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form
          noValidate
          onSubmit={(event) => {
            event.stopPropagation();
            void form.handleSubmit(onSubmit)(event);
          }}
          className="grid gap-5"
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Unir {item?.name}</DialogTitle>
            <DialogDescription>
              Para cuando el mismo {labels.singular} se dio de alta dos veces con otro nombre.
            </DialogDescription>
          </DialogHeader>

          {options.length === 0 ? (
            <p className="text-base">
              No hay otro {labels.singular} activo con el cual unirlo. Activa o agrega primero el que se debe quedar.
            </p>
          ) : (
            <FieldGroup>
              <Controller
                name="targetId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="merge-target">¿Con cuál se une? (este es el que se queda)</FieldLabel>
                    <Select
                      items={Object.fromEntries(options.map((o) => [o.id, o.name]))}
                      value={field.value || null}
                      onValueChange={(value) => field.onChange(value ?? "")}
                    >
                      <SelectTrigger id="merge-target" aria-invalid={fieldState.invalid} className="h-11 w-full bg-white text-base">
                        <SelectValue placeholder={`Elige el ${labels.singular}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.id} value={o.id} className="min-h-11">
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                name="reason"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="merge-reason">Motivo</FieldLabel>
                    <Textarea
                      {...field}
                      id="merge-reason"
                      rows={2}
                      placeholder="Ej. Es el mismo negocio, se dio de alta dos veces"
                      aria-invalid={fieldState.invalid}
                      className="bg-white text-base"
                    />
                    <FieldDescription>Queda en la línea de cambios de cada servicio que se mueve.</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <div role="status" className="rounded-lg border bg-muted/50 p-4 text-sm">
                <p className="mb-2 font-medium text-foreground">Al unir:</p>
                <ul className="grid list-disc gap-1 pl-5 text-foreground">
                  <li>
                    {usageError
                      ? `Todos los servicios de ${item?.name} pasan ${destination}.`
                      : usage === null
                        ? "Contando sus servicios…"
                        : usage === 0
                          ? `${item?.name} no tiene servicios.`
                          : `${servicesText(usage)} de ${item?.name} ${usage === 1 ? "pasa" : "pasan"} ${destination}.`}
                  </li>
                  <li>{item?.name} se desactiva: ya no aparece para elegir, pero no se borra.</li>
                  <li>El total de Reportes no cambia; solo se junta en un renglón.</li>
                  <li>No se puede deshacer con un botón.</li>
                </ul>
              </div>
            </FieldGroup>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            {options.length > 0 && (
              <Button type="submit" size="touch" disabled={isSubmitting}>
                {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Uniendo…" : "Unir y desactivar"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
