"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
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

import { createUnit, updateUnit } from "../actions";
import { normalizeEconomicNumber, unitSchema, type UnitInput } from "../schemas";
import {
  BOX_LENGTHS,
  UNIT_OPERATION_LABELS,
  UNIT_STATUS_LABELS,
  UNIT_TYPE_LABELS,
  UNIT_TYPE_PREFIX,
  UNIT_TYPES,
  type UnitDetail,
} from "../types";

type DriverOption = { id: string; name: string };

const NO_DRIVER = "sin-chofer";
const NO_LENGTH = "sin-longitud";

function toFormValues(unit?: UnitDetail): UnitInput {
  return {
    economicNumber: unit?.economicNumber ?? "",
    type: unit?.type ?? "trailer",
    operation: unit?.operation ?? "",
    status: unit?.status ?? "activo",
    driverId: unit?.driverId ?? "",
    lengthFt: unit?.lengthFt ? String(unit.lengthFt) : "",
    plates: unit?.plates ?? "",
    make: unit?.make ?? "",
    model: unit?.model ?? "",
    year: unit?.year ? String(unit.year) : "",
    vin: unit?.vin ?? "",
    notes: unit?.notes ?? "",
  };
}

/** Grupo al que se regresa después de guardar. */
function listHref(values: UnitInput) {
  if (values.type === "camioneta") return "/unidades?grupo=camionetas";
  return values.operation === "foraneo" ? "/unidades?grupo=foraneo" : "/unidades";
}

export function UnitForm({ unit, drivers }: { unit?: UnitDetail; drivers: DriverOption[] }) {
  const router = useRouter();
  const isEdit = Boolean(unit);

  const form = useForm<UnitInput>({
    resolver: zodResolver(unitSchema),
    defaultValues: toFormValues(unit),
  });

  const type = useWatch({ control: form.control, name: "type" });
  const status = useWatch({ control: form.control, name: "status" });
  const isPickup = type === "camioneta";
  const isBox = type === "caja";

  // El chofer actual puede estar desactivado: se sigue mostrando para no perderlo.
  const driverOptions =
    unit?.driverId && !drivers.some((d) => d.id === unit.driverId)
      ? [...drivers, { id: unit.driverId, name: `${unit.driverName ?? "Chofer"} (inactivo)` }]
      : drivers;

  const typeItems = Object.fromEntries(UNIT_TYPES.map((t) => [t, UNIT_TYPE_LABELS[t]]));
  const driverItems = {
    [NO_DRIVER]: "Sin chofer",
    ...Object.fromEntries(driverOptions.map((d) => [d.id, d.name])),
  };
  const lengthItems = {
    [NO_LENGTH]: "Sin dato",
    ...Object.fromEntries(BOX_LENGTHS.map((l) => [String(l), `${l} pies`])),
  };

  async function onSubmit(values: UnitInput) {
    const clean: UnitInput = {
      ...values,
      operation: values.type === "camioneta" ? "" : values.operation,
      lengthFt: values.type === "caja" ? values.lengthFt : "",
    };
    const number = normalizeEconomicNumber(values.economicNumber);

    try {
      const result = unit ? await updateUnit(unit.id, clean) : await createUnit(clean);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? `Cambios en ${number} guardados` : `Unidad ${number} creada`);
      router.push(listHref(clean));
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const inputClass = "h-11 bg-white text-base";

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl">
      <FieldGroup className="gap-8">
        <FieldSet>
          <FieldLegend className="font-heading text-xl">Identificación</FieldLegend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Controller
              name="type"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="type">Tipo</FieldLabel>
                  <Select
                    items={typeItems}
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Sugerir el prefijo si el número todavía está vacío o solo tiene otro prefijo.
                      const current = form.getValues("economicNumber").trim();
                      if (!current || /^[A-Za-z]+-?$/.test(current)) {
                        form.setValue("economicNumber", `${UNIT_TYPE_PREFIX[value as UnitInput["type"]]}-`);
                      }
                    }}
                  >
                    <SelectTrigger id="type" className={`${inputClass} w-full`} aria-invalid={fieldState.invalid}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="min-h-10">
                          {UNIT_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              name="economicNumber"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="economicNumber">Número económico</FieldLabel>
                  <Input
                    {...field}
                    id="economicNumber"
                    autoCapitalize="characters"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                    className={`${inputClass} font-heading text-lg font-bold tracking-wide uppercase`}
                  />
                  <FieldDescription>Empieza con {UNIT_TYPE_PREFIX[type]}- (por ejemplo {UNIT_TYPE_PREFIX[type]}-17).</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {!isPickup && (
              <Controller
                name="operation"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel id="operation-label">Operación</FieldLabel>
                    <div role="radiogroup" aria-labelledby="operation-label" className="grid grid-cols-2 gap-2">
                      {(["local", "foraneo"] as const).map((op) => (
                        <button
                          key={op}
                          type="button"
                          role="radio"
                          aria-checked={field.value === op}
                          onClick={() => field.onChange(op)}
                          className="h-11 rounded-lg border bg-white text-base font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-brand-cyan aria-checked:bg-brand-cyan aria-checked:text-white"
                        >
                          {UNIT_OPERATION_LABELS[op]}
                        </button>
                      ))}
                    </div>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            )}

            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="status">Estatus</FieldLabel>
                  <Select items={UNIT_STATUS_LABELS} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status" className={`${inputClass} w-full`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value} className="min-h-10">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {status === "baja" && (
                    <FieldDescription className="text-amber-800">
                      Una unidad dada de baja ya no aparece para los capturistas. Su historial se conserva.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend className="font-heading text-xl">Asignación</FieldLegend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Controller
              name="driverId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="driverId">Chofer</FieldLabel>
                  <Select
                    items={driverItems}
                    value={field.value || NO_DRIVER}
                    onValueChange={(value) => field.onChange(value === NO_DRIVER ? "" : value)}
                  >
                    <SelectTrigger id="driverId" className={`${inputClass} w-full`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(driverItems).map(([value, label]) => (
                        <SelectItem key={value} value={value} className="min-h-10">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {drivers.length === 0 && (
                    <FieldDescription>
                      Todavía no hay choferes. Agrégalos en{" "}
                      <Link href="/admin/catalogos">Catálogos</Link>.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />

            {isBox && (
              <Controller
                name="lengthFt"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="lengthFt">Longitud</FieldLabel>
                    <Select
                      items={lengthItems}
                      value={field.value || NO_LENGTH}
                      onValueChange={(value) => field.onChange(value === NO_LENGTH ? "" : value)}
                    >
                      <SelectTrigger id="lengthFt" className={`${inputClass} w-full`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(lengthItems).map(([value, label]) => (
                          <SelectItem key={value} value={value} className="min-h-10">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            )}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend className="font-heading text-xl">Datos del vehículo</FieldLegend>
          <FieldDescription>Opcionales. Puedes completarlos después.</FieldDescription>
          <div className="grid gap-5 sm:grid-cols-2">
            {(
              [
                ["make", "Marca", isPickup ? "Ford" : ""],
                ["model", "Modelo", isPickup ? "F-150" : ""],
                ["plates", "Placas", ""],
                ["year", "Año", ""],
              ] as const
            ).map(([name, label, placeholder]) => (
              <Controller
                key={name}
                name={name}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={name}>{label}</FieldLabel>
                    <Input
                      {...field}
                      id={name}
                      placeholder={placeholder}
                      inputMode={name === "year" ? "numeric" : undefined}
                      autoCapitalize={name === "plates" ? "characters" : undefined}
                      aria-invalid={fieldState.invalid}
                      className={inputClass}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            ))}
            <Controller
              name="vin"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                  <FieldLabel htmlFor="vin">VIN / número de serie</FieldLabel>
                  <Input
                    {...field}
                    id="vin"
                    autoCapitalize="characters"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                    className={`${inputClass} uppercase`}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="notes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                  <FieldLabel htmlFor="notes">Notas</FieldLabel>
                  <Textarea {...field} id="notes" rows={3} aria-invalid={fieldState.invalid} className="bg-white text-base" />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </div>
        </FieldSet>

        <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
          <Link href={unit ? listHref(toFormValues(unit)) : "/unidades"} className={buttonVariants({ variant: "outline", size: "touch" })}>
            Cancelar
          </Link>
          <Button type="submit" size="touch" disabled={isSubmitting}>
            {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear unidad"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
