"use client";

import { ChevronDown, ClipboardPlus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UNIT_GROUP_LABELS, UNIT_GROUPS, unitGroupOf, type UnitGroup } from "@/features/unidades/types";
import { cn } from "@/lib/utils";
import { formatKm } from "@/lib/utils/format";

import {
  byUrgency,
  describeInterval,
  describeLeft,
  describeNext,
  MAINTENANCE_STATUS_ORDER,
  MAINTENANCE_STATUSES,
  registerMaintenanceHref,
  type FleetMaintenance,
  type MaintenanceStatus,
} from "../types";

import { MaintenanceLastTime } from "./maintenance-last-time";
import { MAINTENANCE_STATUS_STYLES, MaintenanceStatusBadge } from "./maintenance-status-badge";

/** Para los botones de filtro (plural). */
const FILTER_LABELS: Record<MaintenanceStatus, string> = {
  vencido: "Vencidos",
  por_vencer: "Por vencer",
  al_corriente: "Al corriente",
  sin_kilometraje: "Sin kilometraje",
};

/** Resumen de la tarjeta cerrada: "2 vencidos", "1 por vencer". */
const countLabel = (status: MaintenanceStatus, n: number) =>
  status === "vencido" ? `${n} ${n === 1 ? "vencido" : "vencidos"}` : `${n} ${FILTER_LABELS[status].toLowerCase()}`;

/** Franja de color a la izquierda de la tarjeta: lo peor que tiene la unidad. */
const EDGE: Record<MaintenanceStatus, string> = {
  vencido: "border-l-red-600",
  por_vencer: "border-l-amber-500",
  al_corriente: "border-l-emerald-600",
  sin_kilometraje: "border-l-border",
};

/** "T17", "t-17" y "T-17" encuentran lo mismo. */
const compact = (text: string) => text.normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

type Unit = {
  unitId: string;
  economicNumber: string;
  unitTypeName: string;
  group: UnitGroup;
  km: number | null;
  items: FleetMaintenance[];
};

/**
 * Pestaña Correctivos (5F): lo que le toca a cada unidad y cuánto le falta.
 * Las unidades van en el mismo orden que la lista de Unidades (grupo, tipo y
 * número: T-2 antes que T-10), para encontrarlas rápido (lo pidió el usuario el
 * 2026-11-10, cuando todas tendrán mantenimientos). Buscador por número y filtros
 * de grupo y de estado. Cada unidad es una tarjeta cerrada con su resumen
 * (cuántos vencidos o por vencer, y su color); al tocarla se abren sus
 * mantenimientos, lo urgente primero, con "Registrar".
 */
export function FleetMaintenanceList({
  items,
  status: initialStatus,
  canRegister,
  canOpenUnits,
  canEdit,
}: {
  /** Ya viene en el orden de la lista de unidades (orden_tipo, numero_orden). */
  items: FleetMaintenance[];
  status: MaintenanceStatus | undefined;
  /** Admin y capturista registran servicios. */
  canRegister: boolean;
  /** Admin y gerente ven la ficha de la unidad y todos los servicios. */
  canOpenUnits: boolean;
  /** Solo el admin programa mantenimientos (al gerente no se le invita a agregar). */
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<UnitGroup | null>(null);
  const [status, setStatus] = useState<MaintenanceStatus | null>(initialStatus ?? null);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Aún no hay mantenimientos programados"
        description={
          canEdit
            ? "Se agregan en la ficha de cada unidad: nombre y cada cuántos km o meses."
            : "Cuando el administrador los programe en cada unidad, aquí verás lo que le toca a cada una."
        }
        action={
          canEdit ? (
            <Link href="/unidades" className={buttonVariants({ variant: "outline", size: "touch" })}>
              Ir a Unidades
            </Link>
          ) : undefined
        }
      />
    );
  }

  // Agrupado por unidad, conservando el orden de la lista de unidades.
  const units: Unit[] = [];
  for (const item of items) {
    const last = units.at(-1);
    if (last?.unitId === item.unitId) last.items.push(item);
    else
      units.push({
        unitId: item.unitId,
        economicNumber: item.economicNumber,
        unitTypeName: item.unitTypeName,
        group: unitGroupOf(item.operation),
        km: item.currentKm,
        items: [item],
      });
  }

  const q = compact(query.trim());
  const searched = q ? units.filter((u) => compact(u.economicNumber).includes(q)) : units;
  const groupsPresent = UNIT_GROUPS.filter((g) => searched.some((u) => u.group === g));
  const inGroup = group ? searched.filter((u) => u.group === group) : searched;

  // Los conteos de estado siguen al buscador y al grupo elegidos.
  const counts = Object.fromEntries(
    MAINTENANCE_STATUSES.map((s) => [s, inGroup.reduce((n, u) => n + u.items.filter((m) => m.status === s).length, 0)]),
  ) as Record<MaintenanceStatus, number>;
  const total = inGroup.reduce((n, u) => n + u.items.length, 0);

  const shown = inGroup
    .map((u) => ({ ...u, items: (status ? u.items.filter((m) => m.status === status) : u.items).toSorted(byUrgency) }))
    .filter((u) => u.items.length > 0);

  // Secciones: grupo y, dentro, tipo (mismo orden en que vienen).
  const sections = UNIT_GROUPS.map((g) => {
    const ofGroup = shown.filter((u) => u.group === g);
    const types: { name: string; units: Unit[] }[] = [];
    for (const u of ofGroup) {
      const last = types.at(-1);
      if (last?.name === u.unitTypeName) last.units.push(u);
      else types.push({ name: u.unitTypeName, units: [u] });
    }
    return { group: g, types };
  }).filter((s) => s.types.length > 0);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Buscar unidad, por ejemplo T-17"
            aria-label="Buscar unidad por número"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 bg-white pl-10 text-base"
          />
        </div>

        {groupsPresent.length > 1 && (
          <Chips
            label="Filtrar por grupo"
            options={[
              { key: "todos", label: "Todas", count: null, active: group === null, onSelect: () => setGroup(null) },
              ...groupsPresent.map((g) => ({
                key: g,
                label: UNIT_GROUP_LABELS[g],
                count: null,
                active: group === g,
                onSelect: () => setGroup(g),
              })),
            ]}
          />
        )}

        <Chips
          label="Filtrar por estado"
          options={[
            { key: "todos", label: "Todos", count: total, active: status === null, onSelect: () => setStatus(null) },
            ...MAINTENANCE_STATUSES.filter((s) => counts[s] > 0 || s === status).map((s) => ({
              key: s,
              label: FILTER_LABELS[s],
              count: counts[s],
              active: status === s,
              onSelect: () => setStatus(s),
            })),
          ]}
        />
      </div>

      {sections.length === 0 ? (
        <p className="rounded-xl border bg-white px-5 py-8 text-center text-muted-foreground">
          {q ? "Ninguna unidad con mantenimientos coincide con la búsqueda." : "Ningún mantenimiento con ese filtro."}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.group} aria-labelledby={`grupo-${section.group}`} className="min-w-0">
              <h2 id={`grupo-${section.group}`} className="mb-3 font-heading text-2xl font-semibold">
                {UNIT_GROUP_LABELS[section.group]}
              </h2>
              <div className="flex flex-col gap-5">
                {section.types.map((type) => (
                  <div key={type.name} className="min-w-0">
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                      {type.name}
                      <span className="ml-2 tabular-nums">
                        {type.units.length} {type.units.length === 1 ? "unidad" : "unidades"}
                      </span>
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {type.units.map((unit) => (
                        <UnitCard key={unit.unitId} unit={unit} canRegister={canRegister} canOpenUnits={canOpenUnits} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Chips({
  label,
  options,
}: {
  label: string;
  options: { key: string; label: string; count: number | null; active: boolean; onSelect: () => void }[];
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.active}
          onClick={o.onSelect}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors outline-none",
            "focus-visible:ring-3 focus-visible:ring-ring/50",
            o.active ? "border-brand-ink bg-brand-ink text-white" : "bg-white hover:border-brand-ink/40",
          )}
        >
          {o.label}
          {o.count !== null && (
            <span className={cn("tabular-nums", o.active ? "text-white/80" : "text-muted-foreground")}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function UnitCard({ unit, canRegister, canOpenUnits }: { unit: Unit; canRegister: boolean; canOpenUnits: boolean }) {
  const worst = unit.items.reduce<MaintenanceStatus>(
    (w, m) => (MAINTENANCE_STATUS_ORDER[m.status] < MAINTENANCE_STATUS_ORDER[w] ? m.status : w),
    unit.items[0]!.status,
  );
  const summary = MAINTENANCE_STATUSES.map((s) => ({ s, n: unit.items.filter((m) => m.status === s).length })).filter(
    (x) => x.n > 0,
  );

  return (
    <li className="min-w-0">
      <details className={cn("group overflow-hidden rounded-xl border border-l-4 bg-white", EDGE[worst])}>
        <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="font-heading text-2xl leading-none font-bold tracking-wide text-brand-ink tabular-nums">
            {unit.economicNumber}
          </span>
          {unit.km !== null && <span className="text-sm whitespace-nowrap text-muted-foreground">{formatKm(unit.km)}</span>}
          <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
            {summary.map(({ s, n }) => (
              <span
                key={s}
                className={cn(
                  "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap tabular-nums",
                  MAINTENANCE_STATUS_STYLES[s],
                )}
              >
                {countLabel(s, n)}
              </span>
            ))}
          </span>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="border-t">
          {canOpenUnits && (
            <div className="border-b bg-muted/30 px-4 py-2 sm:px-5">
              <Link
                href={`/unidades/${unit.unitId}`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-brand-ink underline-offset-4 hover:underline"
              >
                Ver la ficha de {unit.economicNumber}
              </Link>
            </div>
          )}
          <ul className="divide-y">
            {unit.items.map((m) => {
              const next = describeNext(m);
              return (
                <li key={m.id} className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="min-w-0 font-heading text-lg leading-tight font-semibold">{m.name}</p>
                      <MaintenanceStatusBadge status={m.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">{describeInterval(m)}</p>
                    <p className="text-base">
                      {next}
                      {next ? ". " : ""}
                      <span
                        className={cn(
                          m.status === "vencido" && "font-medium text-red-800",
                          m.status === "por_vencer" && "font-medium text-amber-800",
                        )}
                      >
                        {describeLeft(m)}.
                      </span>
                    </p>
                    <MaintenanceLastTime item={m} linkService={canOpenUnits} />
                  </div>
                  {canRegister && (
                    <Link
                      href={registerMaintenanceHref(m)}
                      className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full sm:w-auto")}
                    >
                      <ClipboardPlus aria-hidden="true" />
                      Registrar
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </details>
    </li>
  );
}
