"use client";

import { Check, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UNIT_GROUP_LABELS, UNIT_GROUPS, UNIT_TYPE_LABELS, type UnitGroup } from "@/features/unidades/types";
import { cn } from "@/lib/utils";

import type { MaintenanceTarget } from "../types";

function groupOf(unit: MaintenanceTarget): UnitGroup {
  if (unit.type === "camioneta") return "camionetas";
  return unit.operation === "foraneo" ? "foraneo" : "local";
}

const unitsLabel = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/**
 * "Aplicar también a" del modal de Agregar mantenimiento: el mismo selector de
 * Registrar servicio (hoja con las unidades agrupadas en Locales, Foráneos y
 * Camionetas), pero se eligen varias, o todas de un toque.
 */
export function UnitMultiPicker({
  units,
  value,
  onChange,
  byKm,
}: {
  units: MaintenanceTarget[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** El mantenimiento lleva km: a las cajas y a las que no tienen kilometraje solo pasa lo de meses. */
  byKm: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const chosen = new Set(value);
  const selected = units.filter((u) => chosen.has(u.id));

  const groups = useMemo(() => {
    // Sin espacios ni guiones: "t17", "T 17" y "T-17" encuentran T-17.
    const term = search.replace(/[\s-]/g, "").toUpperCase();
    const matches = term ? units.filter((u) => u.economicNumber.replace(/-/g, "").includes(term)) : units;
    return UNIT_GROUPS.map((group) => ({ group, units: matches.filter((u) => groupOf(u) === group) })).filter(
      (g) => g.units.length > 0,
    );
  }, [units, search]);

  // Conserva el orden de la lista de unidades.
  const set = (ids: Set<string>) => onChange(units.filter((u) => ids.has(u.id)).map((u) => u.id));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set(next);
  };
  const setMany = (list: MaintenanceTarget[], on: boolean) => {
    const next = new Set(chosen);
    for (const u of list) {
      if (on) next.add(u.id);
      else next.delete(u.id);
    }
    set(next);
  };

  const partial = byKm ? selected.filter((u) => !u.hasKm) : [];

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-white p-4">
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">Solo a esta unidad.</p>
        ) : (
          <div className="min-w-0">
            <p className="mb-2 text-sm font-medium">
              {selected.length === units.length ? `Todas las demás (${unitsLabel(selected.length)})` : `${unitsLabel(selected.length)} más`}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <li
                  key={u.id}
                  className="rounded-md bg-brand-ink/5 px-2 py-0.5 font-heading text-base font-semibold tracking-wide tabular-nums text-brand-ink"
                >
                  {u.economicNumber}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="touch" onClick={() => setOpen(true)}>
            {selected.length ? "Cambiar unidades" : "Elegir unidades"}
          </Button>
          {selected.length < units.length && (
            <Button type="button" variant="ghost" size="touch" onClick={() => setMany(units, true)}>
              Todas
            </Button>
          )}
          {selected.length > 0 && (
            <Button type="button" variant="ghost" size="touch" onClick={() => onChange([])}>
              Ninguna
            </Button>
          )}
        </div>
        {partial.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Sin kilometraje o caja, solo por meses: {partial.map((u) => u.economicNumber).join(", ")}.
          </p>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          initialFocus={() => (window.matchMedia("(pointer: coarse)").matches ? listRef.current : true)}
          className="mx-auto flex max-h-[88dvh] max-w-3xl flex-col gap-0 rounded-t-2xl p-0"
        >
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="font-heading text-2xl font-semibold">¿A qué otras unidades se aplica?</SheetTitle>
            <SheetDescription>Toca las unidades para marcarlas o desmarcarlas.</SheetDescription>
            <div className="relative mt-3">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                inputMode="search"
                autoCapitalize="characters"
                autoComplete="off"
                enterKeyHint="search"
                placeholder="Buscar: T-17, R-39…"
                aria-label="Buscar unidad por número económico"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-12 bg-white pl-10 text-base"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="touch" onClick={() => setMany(units, true)}>
                Todas
              </Button>
              <Button type="button" variant="outline" size="touch" onClick={() => onChange([])}>
                Ninguna
              </Button>
            </div>
          </SheetHeader>

          <div
            ref={listRef}
            tabIndex={-1}
            onTouchStart={() => {
              if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
            }}
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pt-4 pb-6 outline-none"
          >
            {groups.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">
                Ninguna unidad coincide con “{search}”. Revisa el número económico.
              </p>
            )}
            {groups.map(({ group, units: groupUnits }) => {
              const allOn = groupUnits.every((u) => chosen.has(u.id));
              return (
                <section key={group} className="mb-6 last:mb-0" aria-labelledby={`aplicar-${group}`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`aplicar-${group}`} className="text-lg font-semibold">
                      {UNIT_GROUP_LABELS[group]}
                      <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                        {groupUnits.filter((u) => chosen.has(u.id)).length} de {groupUnits.length}
                      </span>
                    </h3>
                    <Button type="button" variant="ghost" className="min-h-11" onClick={() => setMany(groupUnits, !allOn)}>
                      {allOn ? "Quitar todas" : "Marcar todas"}
                    </Button>
                  </div>
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {groupUnits.map((unit) => {
                      const on = chosen.has(unit.id);
                      return (
                        <li key={unit.id}>
                          <button
                            type="button"
                            onClick={() => toggle(unit.id)}
                            aria-pressed={on}
                            className={cn(
                              "relative flex min-h-16 w-full flex-col items-center justify-center rounded-lg border bg-white py-1 outline-none transition-colors",
                              "focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted",
                              "aria-pressed:border-brand-cyan aria-pressed:bg-brand-cyan aria-pressed:text-white",
                            )}
                          >
                            {on && <Check className="absolute top-1 right-1 size-4" aria-hidden="true" />}
                            <span className="font-heading text-xl leading-tight font-bold tracking-wide tabular-nums">
                              {unit.economicNumber}
                            </span>
                            <span className="max-w-full px-1 text-xs opacity-75">
                              {UNIT_TYPE_LABELS[unit.type]}
                              {byKm && !unit.hasKm && unit.type !== "caja" ? " · sin km" : ""}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <SheetFooter className="border-t p-4">
            <Button type="button" size="touch" className="w-full" onClick={() => setOpen(false)}>
              {selected.length ? `Listo: ${unitsLabel(selected.length)} más` : "Listo: solo esta unidad"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
