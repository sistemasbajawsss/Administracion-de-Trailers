"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { useGoBack } from "@/components/shared/go-back";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SupplierQuickAdd } from "@/features/catalogos/components/supplier-quick-add";
import {
  ReceiptPicker,
  pendingReceiptMessage,
  type ReceiptDraft,
} from "@/features/comprobantes/components/receipt-picker";
import { uploadReceipts } from "@/features/comprobantes/components/upload-receipts";
import {
  formatCents,
  formatDate,
  formatRate,
  formatUsd,
  toCents,
  toRateUnits,
  usdToMxnCents,
} from "@/lib/utils/format";

import { createService, suggestExchangeRate, updateService } from "../actions";
import {
  serviceEditSchema,
  serviceSchema,
  type Currency,
  type ServiceEditInput,
} from "../schemas";
import type { CategoryOption, ServiceDetail, SupplierOption, UnitOption } from "../types";

import { UnitPicker } from "./unit-picker";

const NO_SUPPLIER = "sin-proveedor";
const emptyExpense: ServiceEditInput["expenses"][number] = {
  id: "",
  categoryId: "",
  concept: "",
  currency: "MXN",
  amount: "",
  exchangeRate: "",
};

function toFormValues(service: ServiceDetail | undefined, today: string, initialUnitId: string): ServiceEditInput {
  return {
    unitId: service?.unit.id ?? initialUnitId,
    date: service?.date ?? today,
    mileage: service?.mileage != null ? String(service.mileage) : "",
    supplierId: service?.supplierId ?? "",
    description: service?.description ?? "",
    // En dólares, el formulario edita la cantidad en dólares; los pesos los calcula la BD.
    expenses: service?.expenses.map((e) => ({
      id: e.id,
      categoryId: e.categoryId,
      concept: e.concept ?? "",
      currency: e.usd ? ("USD" as const) : ("MXN" as const),
      amount: e.usd?.amount ?? e.amount,
      exchangeRate: e.usd ? formatRate(e.usd.rate) : "",
    })) ?? [emptyExpense],
    reason: "",
  };
}

/** Pesos de un renglón en centavos (en dólares, con su tipo de cambio). null si falta algo. */
function lineMxnCents(line: Partial<ServiceEditInput["expenses"][number]>) {
  const cents = toCents(line.amount ?? "");
  if (cents === null) return null;
  if (line.currency !== "USD") return cents;
  const rate = toRateUnits(line.exchangeRate ?? "");
  return rate ? usdToMxnCents(cents, rate) : null;
}

/**
 * Captura y edición de un servicio con sus renglones de gasto.
 * El total se calcula en centavos enteros mientras se escribe; el total
 * oficial siempre sale de la BD.
 */
export function ServiceForm({
  service,
  units,
  categories,
  suppliers: initialSuppliers,
  today,
  initialUnitId = "",
}: {
  service?: ServiceDetail;
  units: UnitOption[];
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  today: string;
  initialUnitId?: string;
}) {
  const router = useRouter();
  const goBack = useGoBack();
  const isEdit = Boolean(service);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [receipts, setReceipts] = useState<ReceiptDraft[]>([]);

  const form = useForm<ServiceEditInput>({
    // En alta no hay motivo: se valida con el schema sin "reason".
    resolver: zodResolver((isEdit ? serviceEditSchema : serviceSchema) as typeof serviceEditSchema),
    defaultValues: toFormValues(service, today, initialUnitId),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "expenses" });

  // La unidad del servicio puede estar de baja: se sigue mostrando para no perderla.
  const unitOptions =
    service && !units.some((u) => u.id === service.unit.id)
      ? [
          ...units,
          {
            id: service.unit.id,
            economicNumber: service.unit.economicNumber,
            type: service.unit.type,
            operation: null,
            status: "baja" as const,
            detail: "Dada de baja",
          },
        ]
      : units;

  const unitId = useWatch({ control: form.control, name: "unitId" });
  const expenses = useWatch({ control: form.control, name: "expenses" });
  const selectedUnit = unitOptions.find((u) => u.id === unitId);
  const isBox = selectedUnit?.type === "caja";

  const totalCents = expenses.reduce((sum, e) => sum + (lineMxnCents(e) ?? 0), 0);
  const usdCents = expenses.reduce((sum, e) => sum + (e.currency === "USD" ? (toCents(e.amount ?? "") ?? 0) : 0), 0);

  // Origen del tipo de cambio sugerido por renglón (se borra en cuanto el usuario lo escribe).
  const [rateNotes, setRateNotes] = useState<Record<string, string>>({});
  const [loadingRate, setLoadingRate] = useState<string | null>(null);

  /**
   * Al pasar un renglón a dólares sin tipo de cambio: se usa el de otro renglón en
   * dólares de este servicio, o el FIX de Banxico del día hábil anterior al servicio.
   */
  async function switchCurrency(index: number, lineKey: string, currency: Currency) {
    form.setValue(`expenses.${index}.currency`, currency, { shouldDirty: true });
    if (currency !== "USD" || form.getValues(`expenses.${index}.exchangeRate`)) return;

    const sibling = form.getValues("expenses").find((e, i) => i !== index && e.currency === "USD" && toRateUnits(e.exchangeRate));
    if (sibling) {
      form.setValue(`expenses.${index}.exchangeRate`, sibling.exchangeRate, { shouldDirty: true });
      setRateNotes((notes) => ({ ...notes, [lineKey]: "El mismo de otro gasto de este servicio" }));
      return;
    }

    setLoadingRate(lineKey);
    try {
      const result = await suggestExchangeRate(form.getValues("date"));
      // Si mientras tanto ya lo escribieron, no se pisa.
      if (form.getValues(`expenses.${index}.exchangeRate`)) return;
      if (result.ok && result.data) {
        form.setValue(`expenses.${index}.exchangeRate`, formatRate(result.data.rate), { shouldDirty: true });
        setRateNotes((notes) => ({
          ...notes,
          [lineKey]: `FIX de Banxico del ${formatDate(result.data!.date)}, día hábil anterior al servicio. Corrígelo si tu factura trae otro.`,
        }));
      } else {
        setRateNotes((notes) => ({ ...notes, [lineKey]: "Escribe el tipo de cambio de la factura." }));
      }
    } catch {
      setRateNotes((notes) => ({ ...notes, [lineKey]: "Escribe el tipo de cambio de la factura." }));
    } finally {
      setLoadingRate((current) => (current === lineKey ? null : current));
    }
  }
  const conceptRequired = new Set(categories.filter((c) => c.requiresConcept).map((c) => c.id));
  const categoryItems = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const supplierItems = {
    [NO_SUPPLIER]: "Sin proveedor (lo hicimos nosotros)",
    ...Object.fromEntries(suppliers.map((s) => [s.id, s.name])),
  };

  async function onSubmit(values: ServiceEditInput) {
    // "Otros (especificar)" exige concepto (la BD también lo valida).
    let missingConcept = false;
    values.expenses.forEach((expense, index) => {
      if (conceptRequired.has(expense.categoryId) && !expense.concept.trim()) {
        form.setError(`expenses.${index}.concept`, { message: "Escribe qué fue el gasto" });
        missingConcept = true;
      }
    });
    if (missingConcept) return;

    const pendingReceipts = pendingReceiptMessage(receipts);
    if (pendingReceipts) return void toast.error(pendingReceipts);

    const clean = { ...values, mileage: isBox ? "" : values.mileage };
    const number = selectedUnit?.economicNumber ?? "la unidad";

    try {
      if (service) {
        const result = await updateService(service.id, service.unit.id, clean);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Cambios guardados en el servicio de ${number}`);
        // Regresa al detalle de donde se vino, ya con los cambios.
        goBack(`/servicios/${service.id}`, { refresh: true });
      } else {
        const result = await createService(clean);
        if (!result.ok) return void toast.error(result.error);
        const saved = `Servicio de ${number} guardado por ${formatCents(totalCents)}`;

        if (receipts.some((r) => r.status === "ready")) {
          // El servicio ya está guardado: si falla un comprobante, se agrega desde el detalle.
          const toastId = toast.loading("Subiendo comprobantes…");
          const outcome = await uploadReceipts(result.data.id, receipts, (current, total) =>
            toast.loading(`Subiendo comprobante ${current} de ${total}…`, { id: toastId }),
          );
          if (outcome.failed.length) {
            const first = outcome.failed[0]!;
            toast.error(`${saved}, pero no se subió ${first.name}: ${first.error} Agrégalo desde el detalle.`, {
              id: toastId,
              duration: 10000,
            });
          } else {
            toast.success(`${saved} con ${outcome.uploaded} ${outcome.uploaded === 1 ? "comprobante" : "comprobantes"}`, { id: toastId });
          }
          for (const duplicate of outcome.duplicates) {
            toast.warning(`Ojo: un comprobante también está en el servicio de ${duplicate.economicNumber} del ${formatDate(duplicate.date)}.`);
          }
        } else {
          toast.success(saved);
        }
        // replace: "Volver" desde el detalle no regresa al formulario ya guardado.
        router.replace(`/servicios/${result.data.id}`);
      }
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const inputClass = "h-12 bg-white text-base";

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl">
      <FieldGroup className="gap-10">
        <Controller
          name="unitId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="unitId" className="font-heading text-xl">Unidad</FieldLabel>
              <UnitPicker
                units={unitOptions}
                value={field.value}
                onChange={(unit) => field.onChange(unit.id)}
                invalid={fieldState.invalid}
              />
              <FieldError id="unitId-error" errors={[fieldState.error]} />
            </Field>
          )}
        />

        <FieldSet>
          <FieldLegend className="font-heading text-xl">Datos del servicio</FieldLegend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Controller
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="date">Fecha</FieldLabel>
                  <Input {...field} id="date" type="date" max={today} aria-invalid={fieldState.invalid} className={inputClass} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {!isBox && (
              <Controller
                name="mileage"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="mileage">Kilometraje (opcional)</FieldLabel>
                    <Input
                      {...field}
                      id="mileage"
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

            <Controller
              name="supplierId"
              control={form.control}
              render={({ field }) => (
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="supplierId">Proveedor o taller</FieldLabel>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                      items={supplierItems}
                      value={field.value || NO_SUPPLIER}
                      onValueChange={(value) => field.onChange(value === NO_SUPPLIER ? "" : value)}
                    >
                      <SelectTrigger id="supplierId" className={`${inputClass} w-full sm:flex-1`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(supplierItems).map(([value, label]) => (
                          <SelectItem key={value} value={value} className="min-h-11">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <SupplierQuickAdd
                      onCreated={(supplier) => {
                        setSuppliers((current) =>
                          [...current, supplier].sort((a, b) => a.name.localeCompare(b.name, "es")),
                        );
                        field.onChange(supplier.id);
                      }}
                    />
                  </div>
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                  <FieldLabel htmlFor="description">Descripción (opcional)</FieldLabel>
                  <Textarea
                    {...field}
                    id="description"
                    rows={2}
                    placeholder="Qué se le hizo a la unidad"
                    aria-invalid={fieldState.invalid}
                    className="bg-white text-base"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend className="font-heading text-xl">Gastos</FieldLegend>
          <FieldDescription>
            Un renglón por cada concepto. Montos con IVA incluido. Si la factura viene en dólares, cambia el renglón a Dólares.
          </FieldDescription>

          <ol className="flex flex-col gap-3">
            {fields.map((line, index) => {
              const expense = expenses[index];
              const requiresConcept = conceptRequired.has(expense?.categoryId ?? "");
              const isUsd = expense?.currency === "USD";
              const mxnCents = expense ? lineMxnCents(expense) : null;
              return (
                <li key={line.id} className="rounded-xl border bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Gasto {index + 1}</span>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-touch"
                        onClick={() => remove(index)}
                        aria-label={`Quitar gasto ${index + 1}`}
                        className="-my-2 -mr-2 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_1fr_10rem]">
                    <Controller
                      name={`expenses.${index}.categoryId`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor={`expense-${index}-category`}>Categoría</FieldLabel>
                          <Select items={categoryItems} value={field.value || null} onValueChange={(value) => field.onChange(value ?? "")}>
                            <SelectTrigger
                              id={`expense-${index}-category`}
                              aria-invalid={fieldState.invalid}
                              className={`${inputClass} w-full`}
                            >
                              <SelectValue placeholder="Elegir" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id} className="min-h-11">
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                    <Controller
                      name={`expenses.${index}.concept`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor={`expense-${index}-concept`}>
                            {requiresConcept ? "¿Qué fue?" : "Concepto (opcional)"}
                          </FieldLabel>
                          <Input
                            {...field}
                            id={`expense-${index}-concept`}
                            autoComplete="off"
                            placeholder={requiresConcept ? "Obligatorio en Otros" : "Ej. Balatas delanteras"}
                            aria-invalid={fieldState.invalid}
                            className={inputClass}
                          />
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                    <Controller
                      name={`expenses.${index}.amount`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor={`expense-${index}-amount`}>{isUsd ? "Dólares" : "Monto"}</FieldLabel>
                          <div className="relative">
                            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
                              {isUsd ? "US$" : "$"}
                            </span>
                            <Input
                              {...field}
                              id={`expense-${index}-amount`}
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="0.00"
                              aria-invalid={fieldState.invalid}
                              className={`${inputClass} ${isUsd ? "pl-12" : "pl-7"} text-right font-medium tabular-nums`}
                            />
                          </div>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  </div>

                  {/* Moneda del renglón. En dólares: tipo de cambio y su equivalente en pesos. */}
                  <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-3 border-t pt-4">
                    <ToggleGroup
                      variant="outline"
                      spacing={0}
                      value={[expense?.currency ?? "MXN"]}
                      onValueChange={(value) => {
                        const next = value[0] as Currency | undefined;
                        if (next && next !== expense?.currency) void switchCurrency(index, line.id, next);
                      }}
                      aria-label={`Moneda del gasto ${index + 1}`}
                    >
                      <ToggleGroupItem value="MXN" className="h-11 px-4 data-[pressed]:bg-brand-ink data-[pressed]:text-white">
                        Pesos
                      </ToggleGroupItem>
                      <ToggleGroupItem value="USD" className="h-11 px-4 data-[pressed]:bg-brand-ink data-[pressed]:text-white">
                        Dólares
                      </ToggleGroupItem>
                    </ToggleGroup>

                    {isUsd && (
                      <>
                        <Controller
                          name={`expenses.${index}.exchangeRate`}
                          control={form.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid} className="w-44">
                              <FieldLabel htmlFor={`expense-${index}-rate`} className="sr-only">
                                Tipo de cambio
                              </FieldLabel>
                              <div className="relative">
                                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">
                                  TC $
                                </span>
                                <Input
                                  {...field}
                                  onChange={(event) => {
                                    field.onChange(event);
                                    if (rateNotes[line.id]) {
                                      setRateNotes((notes) => {
                                        const next = { ...notes };
                                        delete next[line.id];
                                        return next;
                                      });
                                    }
                                  }}
                                  id={`expense-${index}-rate`}
                                  inputMode="decimal"
                                  autoComplete="off"
                                  placeholder={loadingRate === line.id ? "Buscando…" : "18.0000"}
                                  disabled={loadingRate === line.id}
                                  aria-invalid={fieldState.invalid}
                                  aria-describedby={`expense-${index}-rate-note`}
                                  className={`h-11 bg-white pl-12 text-right text-base tabular-nums`}
                                />
                                {loadingRate === line.id && (
                                  <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
                                )}
                              </div>
                              <FieldError errors={[fieldState.error]} />
                            </Field>
                          )}
                        />
                        <p className="ml-auto min-h-11 text-right" aria-live="polite">
                          <span className="block text-sm text-muted-foreground">En pesos</span>
                          <span className="font-medium text-brand-ink tabular-nums">
                            {mxnCents === null ? "—" : formatCents(mxnCents)}
                          </span>
                        </p>
                        {rateNotes[line.id] && (
                          <p id={`expense-${index}-rate-note`} className="w-full text-sm text-muted-foreground">
                            {rateNotes[line.id]}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <Button type="button" variant="outline" size="touch" className="self-start" onClick={() => append(emptyExpense)}>
            <Plus aria-hidden="true" />
            Agregar otro gasto
          </Button>
          {form.formState.errors.expenses?.root && (
            <FieldError errors={[form.formState.errors.expenses.root]} />
          )}
        </FieldSet>

        <FieldSet>
          <FieldLegend className="font-heading text-xl">Comprobantes</FieldLegend>
          {isEdit ? (
            <FieldDescription>Los comprobantes se agregan o se quitan desde el detalle del servicio.</FieldDescription>
          ) : (
            <ReceiptPicker drafts={receipts} onDraftsChange={setReceipts} disabled={form.formState.isSubmitting} />
          )}
        </FieldSet>

        {isEdit && (
          <Controller
            name="reason"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <FieldLabel htmlFor="reason" className="font-heading text-xl">Motivo del cambio</FieldLabel>
                <FieldDescription className="text-amber-900">
                  Queda en la línea de cambios del servicio junto con tu nombre y la hora.
                </FieldDescription>
                <Textarea
                  {...field}
                  id="reason"
                  rows={2}
                  placeholder="Ej. El monto del ticket era otro"
                  aria-invalid={fieldState.invalid}
                  className="bg-white text-base"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}
      </FieldGroup>

      {/* Barra fija: el total siempre visible mientras se capturan los gastos. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-10 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-t-xl sm:border-x sm:px-5">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">
              Total · {expenses.length} {expenses.length === 1 ? "gasto" : "gastos"}
              {usdCents > 0 && (
                <span className="tabular-nums">
                  {" "}· incluye {formatUsd(`${Math.floor(usdCents / 100)}.${String(usdCents % 100).padStart(2, "0")}`)}
                </span>
              )}
            </p>
            <p className="font-heading text-3xl leading-tight font-bold text-brand-ink tabular-nums" aria-live="polite">
              {formatCents(totalCents)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="touch"
            onClick={() => goBack(service ? `/servicios/${service.id}` : "/servicios")}
            className="hidden sm:inline-flex"
          >
            Cancelar
          </Button>
          <Button type="submit" size="touch" disabled={isSubmitting} className="min-w-36">
            {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar servicio"}
          </Button>
        </div>
      </div>
    </form>
  );
}
