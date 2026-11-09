"use client";

import { Check } from "lucide-react";
import type { Ref } from "react";

import { cn } from "@/lib/utils";

import { SERVICE_TYPE_HINTS, SERVICE_TYPE_LABELS, SERVICE_TYPES, type ServiceType } from "../types";

/**
 * Tipo de servicio (5F): tres opciones con lo que significa cada una, como las
 * definió el usuario. Son radios nativos (teclado y lector de pantalla de serie)
 * con forma de tarjeta para tocarlos cómodo en el celular.
 */
export function ServiceTypePicker({
  value,
  onChange,
  inputRef,
  invalid,
}: {
  value: ServiceType | "";
  onChange: (value: ServiceType) => void;
  /** Para que el formulario lleve el foco aquí cuando falta elegir. */
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
}) {
  return (
    <div role="radiogroup" aria-invalid={invalid} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {SERVICE_TYPES.map((type, index) => {
        const checked = value === type;
        return (
          <label
            key={type}
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
              name="serviceType"
              value={type}
              checked={checked}
              onChange={() => onChange(type)}
              className="sr-only"
            />
            <span className="flex items-center gap-2 pr-6 font-heading text-lg font-semibold">
              {SERVICE_TYPE_LABELS[type]}
            </span>
            <span className={cn("text-sm", checked ? "text-white/80" : "text-muted-foreground")}>
              {SERVICE_TYPE_HINTS[type]}
            </span>
            {checked && <Check className="absolute top-3 right-3 size-5" aria-hidden="true" />}
          </label>
        );
      })}
    </div>
  );
}
