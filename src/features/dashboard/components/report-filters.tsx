"use client";

import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNIT_TYPES, UNIT_TYPE_LABELS } from "@/features/unidades/types";

import { GROUPS, GROUP_LABELS, PERIOD_LABELS, type Period } from "../schemas";

import { PrintButton } from "./print-button";

const ALL = "todos";

/**
 * Filtros de Reportes en un renglón, en la URL: periodo (atajos o rango), grupo y
 * tipo de unidad. El Excel se baja con los mismos filtros.
 */
export function ReportFilters({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const period = (searchParams.get("periodo") ?? "12m") as Period;

  function update(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const exportParams = new URLSearchParams(searchParams.toString());
  const groupItems = { [ALL]: "Todos los grupos", ...GROUP_LABELS };
  const typeItems = { [ALL]: "Todos los tipos", ...UNIT_TYPE_LABELS };
  const chip = (active: boolean) =>
    `inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
      active ? "border-brand-ink bg-brand-ink text-white" : "bg-white hover:bg-muted"
    }`;

  return (
    <div className="mb-6 space-y-3 print:hidden">
      {/* Atajos de periodo: en el celular se desliza de lado. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Periodo">
        {(Object.keys(PERIOD_LABELS) as Exclude<Period, "rango">[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={period === key}
            onClick={() => update({ periodo: key === "12m" ? null : key, desde: null, hasta: null })}
            className={chip(period === key)}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={period === "rango"}
          onClick={() => update({ periodo: "rango", desde: from, hasta: to })}
          className={chip(period === "rango")}
        >
          Elegir fechas
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        {period === "rango" && (
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Desde
              <Input
                type="date"
                value={searchParams.get("desde") ?? from}
                max={searchParams.get("hasta") ?? to}
                onChange={(event) => event.target.value && update({ desde: event.target.value })}
                className="h-11 bg-white text-base"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Hasta
              <Input
                type="date"
                value={searchParams.get("hasta") ?? to}
                min={searchParams.get("desde") ?? from}
                onChange={(event) => event.target.value && update({ hasta: event.target.value })}
                className="h-11 bg-white text-base"
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select
            items={groupItems}
            value={searchParams.get("grupo") ?? ALL}
            onValueChange={(value) => update({ grupo: value && value !== ALL ? value : null })}
          >
            <SelectTrigger aria-label="Grupo de unidades" className="h-11 w-full bg-white text-base sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[ALL, ...GROUPS].map((value) => (
                <SelectItem key={value} value={value} className="min-h-11">
                  {groupItems[value as keyof typeof groupItems]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={typeItems}
            value={searchParams.get("tipo") ?? ALL}
            onValueChange={(value) => update({ tipo: value && value !== ALL ? value : null })}
          >
            <SelectTrigger aria-label="Tipo de unidad" className="h-11 w-full bg-white text-base sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[ALL, ...UNIT_TYPES].map((value) => (
                <SelectItem key={value} value={value} className="min-h-11">
                  {typeItems[value as keyof typeof typeItems]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isPending && <LoaderCircle className="size-5 animate-spin self-center text-muted-foreground" aria-label="Actualizando" />}

        <div className="flex flex-col gap-2 sm:flex-row lg:ml-auto">
          <PrintButton />
          <a
            href={`/dashboard/exportar${exportParams.size ? `?${exportParams}` : ""}`}
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            <FileSpreadsheet aria-hidden="true" />
            Exportar a Excel
          </a>
        </div>
      </div>
    </div>
  );
}
