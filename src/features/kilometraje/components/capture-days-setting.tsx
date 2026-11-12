"use client";

import { CalendarDays, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeCaptureDays, WEEKDAY_NAMES } from "@/lib/utils/mileage";

import { setCaptureDays } from "../actions";

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((d, i) => d === b[i]);

/**
 * Días de registro del kilometraje semanal (solo admin): uno o dos días de la
 * semana en que el capturista registra. Se repiten cada semana.
 */
export function CaptureDaysSetting({ days }: { days: number[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>(days);
  const [saving, setSaving] = useState(false);
  const full = selected.length >= 2;
  const changed = !sameDays(selected, days);

  function toggle(day: number) {
    setSelected((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const result = await setCaptureDays(selected);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Días de registro: ${describeCaptureDays(selected)}`);
      router.refresh();
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="group mb-6 rounded-xl border bg-white">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
        <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Días de registro</span>
          <span className="block text-sm text-muted-foreground">
            Los capturistas registran {describeCaptureDays(days)}. Toca para cambiarlos.
          </span>
        </span>
      </summary>
      <div className="border-t px-4 py-4 sm:px-5">
        <p className="mb-3 text-sm text-muted-foreground">
          Elige uno o dos días de la semana. Se repiten cada semana; tú puedes registrar cualquier día.
        </p>
        <div role="group" aria-label="Días de registro" className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const active = selected.includes(day);
            const disabled = !active && full;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => toggle(day)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium capitalize transition-colors outline-none",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                  active ? "border-brand-ink bg-brand-ink text-white" : "bg-white hover:border-brand-ink/40",
                )}
              >
                {WEEKDAY_NAMES[day]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          {selected.length === 0
            ? "Elige al menos un día."
            : full
              ? "Ya elegiste dos días. Quita uno para elegir otro."
              : "Puedes elegir un día más."}
        </p>
        <Button
          size="touch"
          className="mt-4 w-full sm:w-auto"
          disabled={saving || !changed || selected.length === 0}
          onClick={() => void save()}
        >
          {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {saving ? "Guardando…" : "Guardar días"}
        </Button>
      </div>
    </details>
  );
}
