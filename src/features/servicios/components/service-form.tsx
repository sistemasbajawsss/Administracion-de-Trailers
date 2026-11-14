"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { useGoBack } from "@/components/shared/go-back";
import { useRemountAfterSave } from "@/components/shared/use-remount-after-save";
import { EditConflictDialog } from "@/components/shared/edit-conflict-dialog";
import { useReloadForm } from "@/components/shared/use-reload-form";
import { useUnsavedChanges } from "@/components/shared/use-unsaved-changes";
import type { EditConflict } from "@/lib/action-result";
import {
  closedMonthMessage,
  firstOpenDate,
  isMonthClosed,
  monthName,
  monthStart,
  type MonthLock,
} from "@/lib/utils/month-lock";
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
import type { Maintenance } from "@/features/mantenimientos/types";
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRate,
  formatUsd,
  toCents,
  toRateUnits,
  usdToMxnCents,
} from "@/lib/utils/format";
import { describeMileage, mileageIssue } from "@/lib/utils/mileage";
import { useToday } from "@/components/shared/use-today";

import { createService, findSimilarServices, suggestExchangeRate, updateService, type SimilarService } from "../actions";
import {
  placeIssues,
  serviceEditSchema,
  serviceSchema,
  shopIssues,
  type Currency,
  type ServiceEditInput,
} from "../schemas";
import type { WorkshopOption } from "@/features/catalogos/types";

import {
  placeAsksPartsBy,
  placeHasSupplier,
  placeNeedsWorkshop,
  type CategoryOption,
  type ServiceDetail,
  type ServiceType,
  type SupplierOption,
  type UnitOption,
} from "../types";

import { ServiceMaintenancePicker, type MaintenanceChoice } from "./service-maintenance-picker";
import { ServicePartsPicker } from "./service-parts-picker";
import { ServicePlacePicker } from "./service-place-picker";
import { ServiceShopPanel, shopState } from "./service-shop-panel";
import { ServiceTypePicker } from "./service-type-picker";
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

function toFormValues(
  service: ServiceDetail | undefined,
  today: string,
  initial: { unitId: string; serviceType: ServiceType | ""; maintenanceIds: string[] },
): ServiceEditInput {
  return {
    unitId: service?.unit.id ?? initial.unitId,
    date: service?.date ?? today,
    mileage: service?.mileage != null ? String(service.mileage) : "",
    serviceType: service ? (service.serviceType ?? "") : initial.serviceType,
    maintenanceIds: service ? service.maintenance.map((m) => m.id) : initial.maintenanceIds,
    supplierId: service?.supplierId ?? "",
    place: service?.place ?? "",
    workshopId: service?.workshopId ?? "",
    // De fuera: si ya llevaba proveedor, "nosotros llevamos piezas"; si no, "todo lo hizo el taller".
    partsBy: service?.place === "taller_externo" ? (service.supplierId ? "nosotros" : "taller") : "",
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
    // Taller (5E): en alta la casilla viene marcada; al editar, no (editar no saca de taller).
    leavesShop: !service,
    noEntryReason: service?.shop.noEntryReason ?? "",
    forgotEntry: false,
    forgotEntryDate: "",
    forgotEntryFault: "",
    reason: "",
  };
}

/** Al cambiar de unidad, lo de taller vuelve a empezar. */
const shopDefaults = (isEdit: boolean) =>
  ({ leavesShop: !isEdit, noEntryReason: "", forgotEntry: false, forgotEntryDate: "", forgotEntryFault: "" }) as const;

/** Pesos de un renglón en centavos (en dólares, con su tipo de cambio). null si falta algo. */
function lineMxnCents(line: Partial<ServiceEditInput["expenses"][number]>) {
  const cents = toCents(line.amount ?? "");
  if (cents === null) return null;
  if (line.currency !== "USD") return cents;
  const rate = toRateUnits(line.exchangeRate ?? "");
  return rate ? usdToMxnCents(cents, rate) : null;
}

type ServiceFormProps = {
  service?: ServiceDetail;
  units: UnitOption[];
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  /** Talleres de fuera activos, para "¿Dónde se hizo?" (5G). */
  workshops: WorkshopOption[];
  today: string;
  initialUnitId?: string;
  /** Desde "Registrar" de un mantenimiento (5F): correctivo con ese mantenimiento marcado. */
  initialServiceType?: ServiceType | "";
  initialMaintenanceIds?: string[];
  /** Lo programado de cada unidad, para "¿Cuenta como un mantenimiento programado?". */
  maintenanceByUnit?: Record<string, Maintenance[]>;
  /** Cierre de mes (5I): qué meses pasados siguen abiertos. */
  monthLock: MonthLock;
  /** El admin cambia meses cerrados (con aviso); los demás no. */
  isAdmin: boolean;
};

/** Después de guardar, volver a esta pantalla muestra un formulario nuevo (ver useRemountAfterSave). */
export function ServiceForm(props: ServiceFormProps) {
  const { key, markSaved } = useRemountAfterSave();
  // Ediciones simultáneas (5I): "Cargar lo que guardó" monta el formulario con lo nuevo.
  const { key: reloadKey, reload, reloading } = useReloadForm();
  return (
    <ServiceFormBody key={`${key}-${reloadKey}`} {...props} onSaved={markSaved} onReload={reload} reloading={reloading} />
  );
}

/**
 * Captura y edición de un servicio con sus renglones de gasto.
 * El total se calcula en centavos enteros mientras se escribe; el total
 * oficial siempre sale de la BD.
 */
function ServiceFormBody({
  service,
  units,
  categories,
  suppliers: initialSuppliers,
  workshops: initialWorkshops,
  today: serverToday,
  initialUnitId = "",
  initialServiceType = "",
  initialMaintenanceIds = [],
  maintenanceByUnit = {},
  monthLock,
  isAdmin,
  onSaved,
  onReload,
  reloading,
}: ServiceFormProps & { onSaved: () => void; onReload: () => void; reloading: boolean }) {
  const today = useToday(serverToday);
  const router = useRouter();
  const goBack = useGoBack();
  const isEdit = Boolean(service);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [workshops, setWorkshops] = useState(initialWorkshops);
  const [receipts, setReceipts] = useState<ReceiptDraft[]>([]);
  // Guardado con éxito: el botón queda deshabilitado mientras carga la siguiente
  // pantalla (con señal lenta, un segundo toque duplicaba el servicio).
  const [saved, setSaved] = useState(false);
  // Posible duplicado (5H): servicios de la misma unidad ese día o en la misma estancia.
  const [similar, setSimilar] = useState<SimilarService[] | null>(null);
  // Ediciones simultáneas (5I): la versión es la de cuando se abrió el formulario,
  // no la de una actualización sola de la página mientras se escribe.
  const [version] = useState(service?.version ?? "");
  const [conflict, setConflict] = useState<EditConflict | null>(null);

  const form = useForm<ServiceEditInput>({
    // En alta no hay motivo: se valida con el schema sin "reason".
    resolver: zodResolver((isEdit ? serviceEditSchema : serviceSchema) as typeof serviceEditSchema),
    defaultValues: toFormValues(service, today, {
      unitId: initialUnitId,
      serviceType: initialServiceType,
      maintenanceIds: initialMaintenanceIds,
    }),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "expenses" });
  // Renglones vigentes: una respuesta que llega tarde (tipo de cambio) busca su
  // renglón por id, no por la posición que tenía cuando se pidió.
  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
  const indexOf = (lineKey: string) => fieldsRef.current.findIndex((f) => f.id === lineKey);

  // La unidad del servicio puede estar de baja o vendida: se sigue mostrando para no perderla.
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
            detail: "Dada de baja o vendida",
            shopStay: null,
            hasOdometer: service.unit.hasOdometer,
            mileage: null,
          },
        ]
      : units;

  const unitId = useWatch({ control: form.control, name: "unitId" });
  const expenses = useWatch({ control: form.control, name: "expenses" });
  const selectedUnit = unitOptions.find((u) => u.id === unitId);
  // Sin odómetro: cajas, dollys, góndolas… (catálogo de tipos).
  const isBox = selectedUnit ? !selectedUnit.hasOdometer : false;
  // Kilometraje (5F, D14): obligatorio al dar de alta (menos cajas). Al editar sigue
  // opcional para no trabar servicios de antes; la BD revisa que cuadre en ambos casos.
  const mileageRequired = !isEdit && !isBox;
  // La última lectura solo orienta en el alta (al editar, puede ser este mismo servicio).
  const lastMileage = isEdit ? null : (selectedUnit?.mileage ?? null);

  // Mantenimientos (5F, Etapa 4): solo un correctivo cuenta como mantenimiento programado.
  // Al editar, lo que ya tenía marcado se ofrece aunque después se haya quitado.
  const serviceType = useWatch({ control: form.control, name: "serviceType" });
  const place = useWatch({ control: form.control, name: "place" });
  const partsBy = useWatch({ control: form.control, name: "partsBy" });
  const scheduled = maintenanceByUnit[unitId] ?? [];
  const maintenanceChoices: MaintenanceChoice[] = [
    ...scheduled.map((m) => ({ id: m.id, name: m.name, current: m })),
    ...(service && unitId === service.unit.id
      ? service.maintenance
          .filter((m) => !scheduled.some((s) => s.id === m.id))
          .map((m) => ({ id: m.id, name: m.name, current: null }))
      : []),
  ];

  // Taller (5E): estancia abierta de la unidad elegida y qué pasa con este servicio.
  const serviceDate = useWatch({ control: form.control, name: "date" });
  const stay = selectedUnit?.shopStay ?? null;
  const shop = shopState({
    stay,
    date: serviceDate,
    unitId,
    link: service?.shop,
    original: service ? { unitId: service.unit.id, date: service.date } : undefined,
  });

  const totalCents = expenses.reduce((sum, e) => sum + (lineMxnCents(e) ?? 0), 0);
  const usdCents = expenses.reduce((sum, e) => sum + (e.currency === "USD" ? (toCents(e.amount ?? "") ?? 0) : 0), 0);

  // Origen del tipo de cambio sugerido por renglón (se borra en cuanto el usuario lo escribe).
  const [rateNotes, setRateNotes] = useState<Record<string, string>>({});
  const [loadingRate, setLoadingRate] = useState<string | null>(null);
  // Renglones cuyo tipo de cambio vino de Banxico y nadie ha corregido: si cambia la
  // fecha del servicio, se vuelve a sugerir el de la fecha nueva.
  const autoRates = useRef(new Set<string>());

  /** Pide a Banxico el FIX de `date` y lo pone en el renglón, si sigue existiendo. */
  async function suggestRate(lineKey: string, date: string, { overwrite }: { overwrite: boolean }) {
    setLoadingRate(lineKey);
    try {
      const result = await suggestExchangeRate(date);
      const index = indexOf(lineKey);
      if (index < 0) return; // Quitaron el renglón mientras tanto.
      // Si mientras tanto ya lo escribieron (o cambió la fecha otra vez), no se pisa.
      if (!overwrite && form.getValues(`expenses.${index}.exchangeRate`)) return;
      if (overwrite && (!autoRates.current.has(lineKey) || form.getValues("date") !== date)) return;
      if (result.ok && result.data) {
        form.setValue(`expenses.${index}.exchangeRate`, formatRate(result.data.rate), { shouldDirty: true });
        autoRates.current.add(lineKey);
        setRateNotes((notes) => ({
          ...notes,
          [lineKey]: `Tipo de cambio FIX para el ${formatDate(result.data!.date)}, publicado en el DOF el día hábil anterior. Corrígelo si tu factura trae otro.`,
        }));
      } else if (!overwrite) {
        setRateNotes((notes) => ({ ...notes, [lineKey]: "Escribe el tipo de cambio de la factura." }));
      }
    } catch {
      if (!overwrite) setRateNotes((notes) => ({ ...notes, [lineKey]: "Escribe el tipo de cambio de la factura." }));
    } finally {
      setLoadingRate((current) => (current === lineKey ? null : current));
    }
  }

  /**
   * Al pasar un renglón a dólares sin tipo de cambio: se usa el de otro renglón en
   * dólares de este servicio, o el FIX que aplica en la fecha del servicio (publicado
   * en el DOF el día hábil anterior).
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

    await suggestRate(lineKey, form.getValues("date"), { overwrite: false });
  }

  /** La fecha cambió: los tipos de cambio que vinieron de Banxico se piden de nuevo. */
  function refreshSuggestedRates(date: string) {
    for (const lineKey of autoRates.current) {
      if (indexOf(lineKey) < 0) autoRates.current.delete(lineKey);
      else void suggestRate(lineKey, date, { overwrite: true });
    }
  }
  const conceptRequired = new Set(categories.filter((c) => c.requiresConcept).map((c) => c.id));
  const categoryItems = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const supplierItems = {
    [NO_SUPPLIER]: "Sin proveedor",
    ...Object.fromEntries(suppliers.map((s) => [s.id, s.name])),
  };

  /**
   * Kilometraje (5F): obligatorio en alta y que no sea menor al último (el servidor y
   * la BD lo revisan otra vez). Depende de la unidad, por eso no va en el schema; se
   * marca también cuando faltan otros campos, para que salgan todos los errores juntos.
   */
  function markMileageProblem(values: Pick<ServiceEditInput, "mileage" | "date">) {
    const problem = isBox
      ? null
      : mileageIssue(values.mileage, { required: mileageRequired, last: lastMileage, date: values.date });
    if (problem) form.setError("mileage", { message: problem });
    return problem;
  }

  /** Tipo de servicio (5F): obligatorio en alta; al editar uno de antes puede quedar sin tipo. */
  function markTypeProblem(values: Pick<ServiceEditInput, "serviceType">) {
    const problem = !isEdit && !values.serviceType ? "Elige el tipo de servicio" : null;
    if (problem) form.setError("serviceType", { message: problem });
    return problem;
  }

  /** ¿Dónde se hizo? (5G): obligatorio en alta; fuera o en camino, con su taller. */
  function markPlaceProblem(values: Pick<ServiceEditInput, "place" | "workshopId" | "partsBy">) {
    const problems = placeIssues(values, { required: !isEdit });
    for (const problem of problems) form.setError(problem.path, { message: problem.message });
    return problems[0] ?? null;
  }

  /**
   * Cierre de mes (5I): quien no es admin no registra ni mueve servicios a un mes
   * cerrado (la BD lo rechaza igual). El admin sí, después de un aviso.
   */
  function markMonthProblem(values: Pick<ServiceEditInput, "date">) {
    const problem = !isAdmin && isMonthClosed(values.date, monthLock) ? closedMonthMessage(values.date) : null;
    if (problem) form.setError("date", { message: problem });
    return problem;
  }

  /** Lo que depende de la unidad o de si es alta: se marca junto con los errores del schema. */
  function markExtraProblems(values: ServiceEditInput) {
    markTypeProblem(values);
    markPlaceProblem(values);
    markMileageProblem(values);
    markMonthProblem(values);
  }

  const onSubmit = (values: ServiceEditInput) => submit(values, false);

  /** Meses cerrados que el admin ya aceptó cambiar en este formulario (aviso de una vez). */
  const [confirmedClosed, setConfirmedClosed] = useState<string[]>([]);
  const [closedWarning, setClosedWarning] = useState<{ values: ServiceEditInput; skipSimilar: boolean; months: string[] } | null>(
    null,
  );

  /**
   * skipSimilar: ya confirmó que es otro gasto (aviso de posible duplicado).
   * justConfirmed: meses cerrados que el admin acaba de aceptar (el estado aún no se actualiza).
   */
  async function submit(values: ServiceEditInput, skipSimilar: boolean, justConfirmed: string[] = []) {
    // "Otros (especificar)" exige concepto (la BD también lo valida).
    let missingConcept = false;
    values.expenses.forEach((expense, index) => {
      if (conceptRequired.has(expense.categoryId) && !expense.concept.trim()) {
        form.setError(`expenses.${index}.concept`, { message: "Escribe qué fue el gasto" });
        missingConcept = true;
      }
    });
    if (missingConcept) return;

    const typeProblem = markTypeProblem(values);
    if (typeProblem) {
      form.setFocus("serviceType");
      return void toast.error(typeProblem);
    }

    const placeProblem = markPlaceProblem(values);
    if (placeProblem) {
      form.setFocus(placeProblem.path);
      return void toast.error(placeProblem.message);
    }

    const kmProblem = markMileageProblem(values);
    if (kmProblem) {
      form.setFocus("mileage");
      return void toast.error(kmProblem);
    }

    const monthProblem = markMonthProblem(values);
    if (monthProblem) {
      form.setFocus("date");
      return void toast.error(monthProblem);
    }

    // Admin y mes cerrado (5I): avisar una vez antes de guardar.
    if (isAdmin) {
      const months = [...new Set([values.date, service?.date ?? ""].filter((d) => d && isMonthClosed(d, monthLock)).map(monthStart))];
      const pending = months.filter((m) => !confirmedClosed.includes(m) && !justConfirmed.includes(m));
      if (pending.length) return void setClosedWarning({ values, skipSimilar, months: pending });
    }

    // Taller (5E, D13): motivo o datos de la entrada olvidada (el servidor vuelve a revisarlo).
    const shopProblems = shopIssues(values, {
      stay,
      linked: shop.legacy || shop.linkedOpen || shop.linkedClosed,
      needsReason: shop.needsReason,
      allowForgot: shop.allowForgot,
    });
    if (shopProblems.length) {
      for (const problem of shopProblems) form.setError(problem.path, { message: problem.message });
      return void toast.error(shopProblems[0]!.message);
    }

    const pendingReceipts = pendingReceiptMessage(receipts);
    if (pendingReceipts) return void toast.error(pendingReceipts);

    const clean = {
      ...values,
      mileage: isBox ? "" : values.mileage,
      workshopId: placeNeedsWorkshop(values.place) ? values.workshopId : "",
      supplierId: placeHasSupplier(values.place, values.partsBy) ? values.supplierId : "",
      partsBy: placeAsksPartsBy(values.place) ? values.partsBy : "",
      // Solo los de la unidad elegida (lo que se marcó con otra unidad no cuenta).
      maintenanceIds: values.maintenanceIds.filter((id) => maintenanceChoices.some((c) => c.id === id)),
    };
    const number = selectedUnit?.economicNumber ?? "la unidad";

    // Alta: si ya hay servicios de la unidad ese día o en la misma estancia, preguntar
    // antes de guardar (otro pudo capturar el mismo gasto). Si la revisión falla, se guarda.
    if (!service && !skipSimilar) {
      try {
        const found = await findSimilarServices(clean.unitId, clean.date);
        if (found.ok && found.data.length > 0) return void setSimilar(found.data);
      } catch {
        // Sin conexión, el guardado de abajo avisa.
      }
    }

    try {
      if (service) {
        const result = await updateService(service.id, service.unit.id, clean, version);
        if (!result.ok && result.conflict) return void setConflict(result.conflict);
        if (!result.ok) return void toast.error(result.error);
        setSaved(true);
        onSaved();
        toast.success(`Cambios guardados en el servicio de ${number}`);
        // Regresa al detalle de donde se vino, ya con los cambios.
        goBack(`/servicios/${service.id}`, { refresh: true });
      } else {
        const result = await createService(clean);
        if (!result.ok) return void toast.error(result.error);
        setSaved(true);
        onSaved();
        const savedMessage = `Servicio de ${number} guardado por ${formatCents(totalCents)}`;

        if (receipts.some((r) => r.status === "ready")) {
          // El servicio ya está guardado: si falla un comprobante, se agrega desde el detalle.
          const toastId = toast.loading("Subiendo comprobantes…");
          const outcome = await uploadReceipts(result.data.id, receipts, (current, total) =>
            toast.loading(`Subiendo comprobante ${current} de ${total}…`, { id: toastId }),
          );
          if (outcome.failed.length) {
            const first = outcome.failed[0]!;
            toast.error(`${savedMessage}, pero no se subió ${first.name}: ${first.error} Agrégalo desde el detalle.`, {
              id: toastId,
              duration: 10000,
            });
          } else {
            toast.success(`${savedMessage} con ${outcome.uploaded} ${outcome.uploaded === 1 ? "comprobante" : "comprobantes"}`, { id: toastId });
          }
          for (const duplicate of outcome.duplicates) {
            toast.warning(`Ojo: un comprobante también está en el servicio de ${duplicate.economicNumber} del ${formatDate(duplicate.date)}.`);
          }
        } else {
          toast.success(savedMessage);
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
  const { confirmLeave, leaveDialog } = useUnsavedChanges(
    (form.formState.isDirty || receipts.length > 0) && !saved && !isSubmitting,
    onSaved,
  );

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit, () => markExtraProblems(form.getValues()))}
      className="max-w-3xl"
    >
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
                onChange={(unit) => {
                  if (unit.id !== field.value) {
                    for (const [name, value] of Object.entries(shopDefaults(isEdit))) {
                      form.setValue(name as keyof ReturnType<typeof shopDefaults>, value as never, { shouldDirty: true });
                    }
                    // Los mantenimientos son de cada unidad: lo marcado no pasa a la otra.
                    form.setValue("maintenanceIds", [], { shouldDirty: true });
                  }
                  field.onChange(unit.id);
                }}
                invalid={fieldState.invalid}
              />
              <FieldError id="unitId-error" errors={[fieldState.error]} />
            </Field>
          )}
        />

        {unitId && (
          // key: al cambiar de unidad, el panel empieza de cero (motivo elegido, etc.).
          <ServiceShopPanel key={unitId} form={form} stay={stay} state={shop} today={today} />
        )}

        <Controller
          name="serviceType"
          control={form.control}
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid}>
              <FieldLegend className="font-heading text-xl">Tipo de servicio</FieldLegend>
              <ServiceTypePicker
                value={field.value}
                onChange={field.onChange}
                inputRef={field.ref}
                invalid={fieldState.invalid}
              />
              {isEdit && !service?.serviceType && !field.value && (
                <FieldDescription>Este servicio es de antes y no tiene tipo. Puedes elegirlo o dejarlo así.</FieldDescription>
              )}
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />

        {serviceType === "correctivo" && unitId && (
          <Controller
            name="maintenanceIds"
            control={form.control}
            render={({ field }) => (
              <FieldSet>
                <FieldLegend className="font-heading text-xl">¿Cuenta como un mantenimiento programado?</FieldLegend>
                {maintenanceChoices.length ? (
                  <>
                    <FieldDescription>
                      Marca lo que se hizo en este servicio: vuelve a contar desde su fecha y su kilometraje. Si no
                      marcas nada, el contador no cambia.
                    </FieldDescription>
                    <ServiceMaintenancePicker choices={maintenanceChoices} value={field.value} onChange={field.onChange} />
                  </>
                ) : (
                  <FieldDescription>
                    {selectedUnit?.economicNumber ?? "Esta unidad"} no tiene mantenimientos programados. Se agregan en la
                    ficha de la unidad.
                  </FieldDescription>
                )}
              </FieldSet>
            )}
          />
        )}

        <Controller
          name="place"
          control={form.control}
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid}>
              <FieldLegend className="font-heading text-xl">¿Dónde se hizo?</FieldLegend>
              <ServicePlacePicker
                value={field.value}
                onChange={field.onChange}
                inputRef={field.ref}
                invalid={fieldState.invalid}
              />
              {isEdit && !service?.place && !field.value && (
                <FieldDescription>Este servicio es de antes y no dice dónde se hizo. Puedes elegirlo o dejarlo así.</FieldDescription>
              )}
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />

        {placeNeedsWorkshop(place) && (
          <Controller
            name="workshopId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="workshopId" className="font-heading text-xl">
                  ¿Qué taller?
                </FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    items={Object.fromEntries(workshops.map((w) => [w.id, w.name]))}
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value ?? "")}
                  >
                    <SelectTrigger
                      id="workshopId"
                      ref={field.ref}
                      aria-invalid={fieldState.invalid}
                      className={`${inputClass} w-full sm:flex-1`}
                    >
                      <SelectValue placeholder={workshops.length ? "Elige el taller" : "Agrega el taller con el botón"} />
                    </SelectTrigger>
                    <SelectContent>
                      {workshops.map((w) => (
                        <SelectItem key={w.id} value={w.id} className="min-h-11">
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <SupplierQuickAdd
                    kind="talleres"
                    onCreated={(workshop) => {
                      // "Usar este" (5I) regresa uno que ya está en la lista: no se repite.
                      setWorkshops((current) =>
                        current.some((w) => w.id === workshop.id)
                          ? current
                          : [...current, workshop].sort((a, b) => a.name.localeCompare(b.name, "es")),
                      );
                      field.onChange(workshop.id);
                      form.clearErrors("workshopId");
                    }}
                  />
                </div>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}

        {placeAsksPartsBy(place) && (
          <Controller
            name="partsBy"
            control={form.control}
            render={({ field, fieldState }) => (
              <FieldSet data-invalid={fieldState.invalid}>
                <FieldLegend className="font-heading text-xl">¿Quién puso las piezas?</FieldLegend>
                <ServicePartsPicker
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    form.clearErrors("partsBy");
                  }}
                  inputRef={field.ref}
                  invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </FieldSet>
            )}
          />
        )}

        <FieldSet>
          <FieldLegend className="font-heading text-xl">Datos del servicio</FieldLegend>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Controller
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="date">Fecha</FieldLabel>
                  <Input
                    {...field}
                    onChange={(event) => {
                      field.onChange(event);
                      if (event.target.value) refreshSuggestedRates(event.target.value);
                      // Cierre de mes (5I): avisar en cuanto se elige un mes cerrado.
                      if (!markMonthProblem({ date: event.target.value })) form.clearErrors("date");
                    }}
                    id="date"
                    type="date"
                    min={isAdmin ? undefined : firstOpenDate(monthLock)}
                    max={today}
                    aria-invalid={fieldState.invalid}
                    className={inputClass}
                  />
                  {!isAdmin && (
                    <FieldDescription>
                      Desde el {formatDate(firstOpenDate(monthLock))}: los meses anteriores ya están cerrados.
                    </FieldDescription>
                  )}
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
                    <FieldLabel htmlFor="mileage">
                      {mileageRequired || service?.mileage != null ? "Kilometraje" : "Kilometraje (opcional)"}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="mileage"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Ej. 250000"
                      aria-invalid={fieldState.invalid}
                      aria-required={mileageRequired}
                      className={`${inputClass} tabular-nums`}
                    />
                    {lastMileage && (
                      <FieldDescription>Último registrado: {describeMileage(lastMileage)}</FieldDescription>
                    )}
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            )}

            {placeHasSupplier(place, partsBy) && (
            <Controller
              name="supplierId"
              control={form.control}
              render={({ field }) => (
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="supplierId">Proveedor de las piezas</FieldLabel>
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
                        // "Usar este" (5I) regresa uno que ya está en la lista: no se repite.
                        setSuppliers((current) =>
                          current.some((s) => s.id === supplier.id)
                            ? current
                            : [...current, supplier].sort((a, b) => a.name.localeCompare(b.name, "es")),
                        );
                        field.onChange(supplier.id);
                      }}
                    />
                  </div>
                </Field>
              )}
            />
            )}

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
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem]">
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
                                    autoRates.current.delete(line.id);
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
            <ReceiptPicker drafts={receipts} onDraftsChange={setReceipts} disabled={isSubmitting || saved} />
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
            onClick={() => confirmLeave(() => goBack(service ? `/servicios/${service.id}` : "/servicios"))}
            className="hidden sm:inline-flex"
          >
            Cancelar
          </Button>
          <Button type="submit" size="touch" disabled={isSubmitting || saved} className="min-w-36">
            {(isSubmitting || saved) && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Guardando…" : saved ? "Guardado" : isEdit ? "Guardar cambios" : "Guardar servicio"}
          </Button>
        </div>
      </div>
      {leaveDialog}
      <AlertDialog open={closedWarning !== null} onOpenChange={(open) => !open && setClosedWarning(null)}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">
              {closedWarning
                ? `${closedWarning.months.map((m) => monthName(m)).join(" y ")} ${closedWarning.months.length === 1 ? "ya está cerrado" : "ya están cerrados"}`
                    .replace(/^./, (c) => c.toUpperCase())
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este cambio mueve el reporte de un mes que ya se cerró. El capturista no puede hacerlo; tú sí, y queda en la
              línea de cambios del servicio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Revisar</AlertDialogCancel>
            <Button
              type="button"
              size="touch"
              onClick={() => {
                const pending = closedWarning;
                if (!pending) return;
                setConfirmedClosed((current) => [...current, ...pending.months]);
                setClosedWarning(null);
                void submit(pending.values, pending.skipSimilar, pending.months);
              }}
            >
              Guardar de todos modos
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <EditConflictDialog
        conflict={conflict}
        subject="Este servicio"
        reloading={reloading}
        onReload={onReload}
        onClose={() => setConflict(null)}
      />
      <AlertDialog open={similar !== null} onOpenChange={(open) => !open && setSimilar(null)}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedUnit?.economicNumber ?? "Esta unidad"} ya tiene {similar && similar.length === 1 ? "un servicio" : "servicios"} así
            </AlertDialogTitle>
            <AlertDialogDescription>
              Revisa que no sea el mismo gasto capturado por otra persona. ¿El que vas a guardar es otro gasto distinto?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="grid gap-2">
            {(similar ?? []).map((item) => (
              <li key={item.id} className="min-w-0 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{item.description ?? item.categories ?? "Sin descripción"}</span>
                  <span className="font-heading text-base font-semibold whitespace-nowrap tabular-nums">{formatMoney(item.total)}</span>
                </p>
                {item.description && item.categories && <p className="text-muted-foreground">{item.categories}</p>}
                <p className="text-muted-foreground">
                  {item.sameStay ? "En esta misma estancia en taller" : `Del ${formatDate(item.date)}`}, capturado por {item.author ?? "alguien"} el{" "}
                  {formatDateTime(item.createdAt)}
                </p>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">No, revisar</AlertDialogCancel>
            <Button
              className="min-h-11"
              onClick={() => {
                setSimilar(null);
                void form.handleSubmit((values) => submit(values, true), () => markExtraProblems(form.getValues()))();
              }}
            >
              Sí, es otro, guardar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
