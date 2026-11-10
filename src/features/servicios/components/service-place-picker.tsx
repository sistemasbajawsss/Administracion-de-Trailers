"use client";

import { Check } from "lucide-react";
import type { Ref } from "react";

import { cn } from "@/lib/utils";

import { SERVICE_PLACE_HINTS, SERVICE_PLACE_LABELS, SERVICE_PLACES, type ServicePlace } from "../types";

/**
 * ¿Dónde se hizo? (5G): Taller Realso, taller de fuera o en camino. Mismo
 * aspecto que el tipo de servicio: radios nativos con forma de tarjeta.
 */
export function ServicePlacePicker({
  value,
  onChange,
  inputRef,
  invalid,
}: {
  value: ServicePlace | "";
  onChange: (value: ServicePlace) => void;
  /** Para que el formulario lleve el foco aquí cuando falta elegir. */
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
}) {
  return (
    <div role="radiogroup" aria-invalid={invalid} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {SERVICE_PLACES.map((place, index) => {
        const checked = value === place;
        return (
          <label
            key={place}
            className={cn(
              "relative flex min-h-14 min-w-0 cursor-pointer flex-col justify-center rounded-lg border bg-white px-4 py-3 transition-colors",
              "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              checked ? "border-brand-ink bg-brand-ink text-white" : "hover:border-brand-ink/40",
              invalid && !checked && "border-destructive",
            )}
          >
            <input
              ref={index === 0 ? inputRef : undefined}
              type="radio"
              name="place"
              value={place}
              checked={checked}
              onChange={() => onChange(place)}
              className="sr-only"
            />
            <span className="flex items-center gap-2 pr-6 font-heading text-lg font-semibold">{SERVICE_PLACE_LABELS[place]}</span>
            <span className={cn("text-sm", checked ? "text-white/80" : "text-muted-foreground")}>
              {SERVICE_PLACE_HINTS[place]}
            </span>
            {checked && <Check className="absolute top-3 right-3 size-5" aria-hidden="true" />}
          </label>
        );
      })}
    </div>
  );
}
