"use client";

import { Check } from "lucide-react";

import { MaintenanceStatusBadge } from "@/features/mantenimientos/components/maintenance-status-badge";
import { describeLeft, describeNext, type Maintenance } from "@/features/mantenimientos/types";
import { cn } from "@/lib/utils";

/** Un mantenimiento que se puede marcar: los programados de la unidad o uno ya marcado que después se quitó. */
export type MaintenanceChoice = { id: string; name: string; current: Maintenance | null };

/**
 * "¿Cuenta como un mantenimiento programado?" (5F): solo en los correctivos.
 * Lo marcado vuelve a contar desde la fecha y el kilometraje de este servicio.
 * Casillas nativas con forma de tarjeta, como el tipo de servicio.
 */
export function ServiceMaintenancePicker({
  choices,
  value,
  onChange,
}: {
  choices: MaintenanceChoice[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...value.filter((v) => v !== id), id] : value.filter((v) => v !== id));

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {choices.map((choice) => {
        const checked = value.includes(choice.id);
        const m = choice.current;
        const next = m ? describeNext(m) : "";
        return (
          <li key={choice.id} className="min-w-0">
            <label
              className={cn(
                "relative flex h-full min-h-14 cursor-pointer gap-3 rounded-lg border bg-white px-4 py-3 transition-colors",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                checked ? "border-brand-ink bg-brand-ink/5" : "hover:border-brand-ink/40",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => toggle(choice.id, event.target.checked)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border",
                  checked ? "border-brand-ink bg-brand-ink text-white" : "border-input bg-white",
                )}
              >
                {checked && <Check className="size-4" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 font-heading text-lg leading-tight font-semibold">{choice.name}</span>
                  {m && <MaintenanceStatusBadge status={m.status} />}
                </span>
                <span className="text-sm text-muted-foreground">
                  {m
                    ? `${next}${next ? ". " : ""}${describeLeft(m)}.`
                    : "Ya no está programado; se queda marcado si no lo quitas."}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
