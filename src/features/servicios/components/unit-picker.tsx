"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "cn";

import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { UNIT_GROUP_LABELS, UNIT_GROUPS, type UnitGroup } from "@/features/unidades/types";

import type { UnitOption } from "../types";

function groupOf(unit: UnitOption): UnitGroup {
  if (unit.type === "camioneta") return "camionetas";
  return unit.operation === "foraneo" ? "foraneo" : "local";
}

/**
 * Selector de unidad para el taller: la unidad elegida se muestra con su
 * número económico en grande; al tocarla se abre una hoja con todas las
 * unidades como botones, agrupadas en Locales, Foráneos y Camionetas.
 */
export function UnitPicker({
  units,
  value,
  onChange,
  invalid,
}: {
  units: UnitOption[];
  value: string;
  onChange: (unit: UnitOption) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = units.find((u) => u.id === value);

  const groups = useMemo(() => {
    const term = search.replace(/\s/g, "").toUpperCase();
    const matches = term ? units.filter((u) => u.economicNumber.includes(term)) : units;
    return UNIT_GROUPS.map((group) => ({
      group,
      units: matches.filter((u) => groupOf(u) === group),
    })).filter((g) => g.units.length > 0);
  }, [units, search]);

  function pick(unit: UnitOption) {
    onChange(unit);
    setOpen(false);
    setSearch("");
  }

  return (
    <>
      <button
        type="button"
        id="unitId"
        onClick={() => setOpen(true)}
        aria-describedby={invalid ? "unitId-error" : undefined}
        className={cn(
          "flex min-h-24 w-full items-center gap-5 rounded-xl border-2 bg-white px-5 py-4 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          selected ? "border-brand-ink/15" : "border-dashed border-input",
          invalid && "border-destructive",
        )}
      >
        {selected ? (
          <>
            <span className="font-heading text-5xl leading-none font-bold tracking-wide text-brand-ink tabular-nums">
              {selected.economicNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base">{selected.detail}</span>
              <span className="block text-sm text-muted-foreground">{UNIT_GROUP_LABELS[groupOf(selected)]}</span>
            </span>
            <span className="text-sm font-medium text-brand-cyan">Cambiar</span>
          </>
        ) : (
          <span className="flex-1">
            <span className="block font-heading text-2xl font-semibold">Elegir unidad</span>
            <span className="block text-sm text-muted-foreground">Toca para ver trailers, cajas, rabones, pipas y camionetas</span>
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto flex max-h-[88dvh] max-w-3xl flex-col gap-0 rounded-t-2xl p-0">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="font-heading text-2xl font-semibold">¿A qué unidad se le hizo el servicio?</SheetTitle>
            <SheetDescription className="sr-only">Busca por número económico o toca la unidad.</SheetDescription>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                inputMode="search"
                autoCapitalize="characters"
                placeholder="Buscar: T-17, R-39…"
                aria-label="Buscar unidad por número económico"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-12 bg-white pl-10 text-base"
              />
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-8">
            {groups.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">
                Ninguna unidad coincide con “{search}”. Revisa el número económico.
              </p>
            )}
            {groups.map(({ group, units: groupUnits }) => (
              <section key={group} className="mb-6 last:mb-0" aria-labelledby={`grupo-${group}`}>
                <h3 id={`grupo-${group}`} className="mb-2 text-lg font-semibold">
                  {UNIT_GROUP_LABELS[group]}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{groupUnits.length}</span>
                </h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {groupUnits.map((unit) => (
                    <li key={unit.id}>
                      <button
                        type="button"
                        onClick={() => pick(unit)}
                        aria-pressed={unit.id === value}
                        className="flex h-16 w-full flex-col items-center justify-center rounded-lg border bg-white outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted aria-pressed:border-brand-cyan aria-pressed:bg-brand-cyan aria-pressed:text-white"
                      >
                        <span className="font-heading text-xl leading-tight font-bold tracking-wide tabular-nums">
                          {unit.economicNumber}
                        </span>
                        <span className="max-w-full truncate px-1 text-xs opacity-75">
                          {unit.detail.split(" · ")[0]}
                          {unit.status === "en_taller" ? " · taller" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
