"use client";

import { Check } from "lucide-react";
import type { Ref } from "react";

import { cn } from "@/lib/utils";

import { PARTS_BY, PARTS_BY_HINTS, PARTS_BY_LABELS, type PartsBy } from "../types";

/**
 * Taller de fuera: ¿quién puso las piezas? Mismo aspecto que "¿Dónde se hizo?".
 * "Nosotros llevamos piezas" muestra "Proveedor de las piezas".
 */
export function ServicePartsPicker({
  value,
  onChange,
  inputRef,
  invalid,
}: {
  value: PartsBy | "";
  onChange: (value: PartsBy) => void;
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
}) {
  return (
    <div role="radiogroup" aria-invalid={invalid} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PARTS_BY.map((option, index) => {
        const checked = value === option;
        return (
          <label
            key={option}
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
              name="partsBy"
              value={option}
              checked={checked}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            <span className="flex items-center gap-2 pr-6 font-heading text-lg font-semibold">{PARTS_BY_LABELS[option]}</span>
            <span className={cn("text-sm", checked ? "text-white/80" : "text-muted-foreground")}>
              {PARTS_BY_HINTS[option]}
            </span>
            {checked && <Check className="absolute top-3 right-3 size-5" aria-hidden="true" />}
          </label>
        );
      })}
    </div>
  );
}
