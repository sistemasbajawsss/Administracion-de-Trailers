"use client";

import { CalendarClock, ChevronDown, ClipboardPlus, Gauge, Search, Wrench } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
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
  type MaintenanceWarnings,
} from "../types";

import { MaintenanceLastTime } from "./maintenance-last-time";
import { MAINTENANCE_STATUS_STYLES, MaintenanceStatusBadge } from "./maintenance-status-badge";
import { MaintenanceWarningDialog } from "./maintenance-warning-dialog";

/** Resumen de la tarjeta cerrada de cada unidad: "2 para hacer ahora", "1 por programar". */
const COUNT_LABELS: Record<MaintenanceStatus, [string, string]> = {
  realizar_ahora: ["para hacer ahora", "para hacer ahora"],
  programar: ["por programar", "por programar"],
  al_corriente: ["al corriente", "al corriente"],
  sin_kilometraje: ["sin kilometraje", "sin kilometraje"],
};
const countLabel = (status: MaintenanceStatus, n: number) => `${n} ${COUNT_LABELS[status][n === 1 ? 0 : 1]}`;

/** Franja de color a la izquierda de la tarjeta: lo peor que tiene la unidad. */
const EDGE: Record<MaintenanceStatus, string> = {
  realizar_ahora: "border-l-red-600",
  programar: "border-l-amber-500",
  al_corriente: "border-l-emerald-600",
  sin_kilometraje: "border-l-border",
};

/** Color del "cuánto le falta". */
const LEFT_TEXT: Partial<Record<MaintenanceStatus, string>> = {
  realizar_ahora: "font-medium text-red-800",
  programar: "font-medium text-amber-800",
};

/** "T17", "t-17" y "T-17" encuentran lo mismo. */
const compact = (text: string) => text.normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

const unitsLabel = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

type Unit = {
  unitId: string;
  economicNumber: string;
  unitTypeName: string;
  group: UnitGroup;
  km: number | null;
  items: FleetMaintenance[];
};

/**
 * Pestaña Correctivos (5F, reordenada en la 5J a pedido del usuario):
 * 1. Resumen: cuántos hay para realizar ahora, por programar y al corriente
 *    (llevan a su sección).
 * 2. Aviso de kilometraje: cuántos km antes se avisa (el admin lo cambia).
 * 3. "Realizar mantenimiento ahora" y "Programar servicio": tarjetas abiertas,
 *    una por mantenimiento, lo más urgente primero, con Registrar a la vista.
 *    Cada lista con su propio cuadro de scroll (hay más cosas debajo).
 * 4. "Todas las unidades": en el orden de la lista de Unidades, tarjetas
 *    cerradas con su resumen (como antes).
 * El buscador y el grupo filtran las tres secciones.
 */
export function FleetMaintenanceList({
  items,
  warnings,
  canRegister,
  canOpenUnits,
  canEdit,
}: {
  /** Ya viene en el orden de la lista de unidades (orden_tipo, numero_orden). */
  items: FleetMaintenance[];
  warnings: MaintenanceWarnings;
  /** Admin y capturista registran servicios. */
  canRegister: boolean;
  /** Admin y gerente ven la ficha de la unidad y todos los servicios. */
  canOpenUnits: boolean;
  /** Solo el admin programa mantenimientos y cambia el aviso. */
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<UnitGroup | null>(null);

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
    // [length - 1] y no .at(-1) ni .toSorted(): iPhones con iOS viejo no los tienen.
    const last = units[units.length - 1];
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
  const shown = (group ? searched.filter((u) => u.group === group) : searched).map((u) => ({
    ...u,
    items: u.items.slice().sort(byUrgency),
  }));

  const all = shown.flatMap((u) => u.items);
  const now = all.filter((m) => m.status === "realizar_ahora").sort(byUrgency);
  const soon = all.filter((m) => m.status === "programar").sort(byUrgency);
  const fine = all.filter((m) => m.status === "al_corriente").length;
  const noKm = all.filter((m) => m.status === "sin_kilometraje").length;

  // Secciones de "Todas las unidades": grupo y, dentro, tipo (mismo orden en que vienen).
  const sections = UNIT_GROUPS.map((g) => {
    const ofGroup = shown.filter((u) => u.group === g);
    const types: { name: string; units: Unit[] }[] = [];
    for (const u of ofGroup) {
      const last = types[types.length - 1];
      if (last?.name === u.unitTypeName) last.units.push(u);
      else types.push({ name: u.unitTypeName, units: [u] });
    }
    return { group: g, types };
  }).filter((s) => s.types.length > 0);

  return (
    <>
      <Summary now={now.length} soon={soon.length} fine={fine} />

      <WarningBar warnings={warnings} canEdit={canEdit} />

      <div className="mb-8 flex flex-col gap-3">
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
          <div role="group" aria-label="Filtrar por grupo" className="flex flex-wrap gap-2">
            {[null, ...groupsPresent].map((g) => (
              <button
                key={g ?? "todas"}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors outline-none",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  group === g ? "border-brand-ink bg-brand-ink text-white" : "bg-white hover:border-brand-ink/40",
                )}
              >
                {g ? UNIT_GROUP_LABELS[g] : "Todas"}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border bg-white px-5 py-8 text-center text-muted-foreground">
          Ninguna unidad con mantenimientos coincide con la búsqueda.
        </p>
      ) : (
        <div className="flex flex-col gap-12">
          <DueSection
            id="realizar-ahora"
            icon={<Wrench className="size-6 text-red-700" aria-hidden="true" />}
            title="Realizar mantenimiento ahora"
            description="Ya se pasaron, o les faltan 1,000 km o menos (15 días si van por meses). Lo más atrasado primero."
            empty="Nada para hacer ahora."
            items={now}
            canRegister={canRegister}
            canOpenUnits={canOpenUnits}
          />
          <DueSection
            id="programar"
            icon={<CalendarClock className="size-6 text-amber-700" aria-hidden="true" />}
            title="Programar servicio"
            description="Ya entraron en el aviso: conviene hacerlo antes del próximo viaje. Lo que menos le falta primero."
            empty="Nada por programar."
            items={soon}
            canRegister={canRegister}
            canOpenUnits={canOpenUnits}
          />

          <section id="todas" aria-labelledby="todas-titulo" className="min-w-0 scroll-mt-20">
            <h2 id="todas-titulo" className="font-heading text-2xl font-semibold">
              Todas las unidades
            </h2>
            <p className="mb-5 text-muted-foreground">
              {unitsLabel(shown.length)} con mantenimientos. Toca una para ver los suyos.
              {noKm > 0 && ` ${noKm} sin kilometraje registrado todavía.`}
            </p>
            <div className="flex flex-col gap-8">
              {sections.map((section) => (
                <div key={section.group} className="min-w-0">
                  <h3 className="mb-3 font-heading text-xl font-semibold">{UNIT_GROUP_LABELS[section.group]}</h3>
                  <div className="flex flex-col gap-5">
                    {section.types.map((type) => (
                      <div key={type.name} className="min-w-0">
                        <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                          {type.name}
                          <span className="ml-2 tabular-nums">{unitsLabel(type.units.length)}</span>
                        </h4>
                        <ul className="flex flex-col gap-2">
                          {type.units.map((unit) => (
                            <UnitCard key={unit.unitId} unit={unit} canRegister={canRegister} canOpenUnits={canOpenUnits} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/** Tres recuadros con los conteos; cada uno lleva a su sección. */
function Summary({ now, soon, fine }: { now: number; soon: number; fine: number }) {
  const tiles = [
    { href: "#realizar-ahora", n: now, label: "Realizar ahora", tone: now ? "border-red-600 bg-red-50 text-red-900" : "bg-white" },
    { href: "#programar", n: soon, label: "Programar servicio", tone: soon ? "border-amber-500 bg-amber-50 text-amber-900" : "bg-white" },
    { href: "#todas", n: fine, label: "Al corriente", tone: "border-emerald-600/40 bg-emerald-50 text-emerald-900" },
  ];
  return (
    <nav aria-label="Resumen de mantenimientos" className="mb-4">
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((t) => (
          <li key={t.href} className="min-w-0">
            <a
              href={t.href}
              className={cn(
                "flex h-full min-h-20 flex-col justify-between gap-1 rounded-xl border-2 px-3 py-2 outline-none transition-colors sm:px-4 sm:py-3",
                "focus-visible:ring-3 focus-visible:ring-ring/50 hover:brightness-[0.97]",
                t.tone,
              )}
            >
              <span className="font-heading text-4xl leading-none font-bold tabular-nums sm:text-5xl">{t.n}</span>
              <span className="text-sm leading-tight font-medium sm:text-base">{t.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Se avisa 4,000 km antes…" y, para el admin, el botón para cambiarlo. */
function WarningBar({ warnings, canEdit }: { warnings: MaintenanceWarnings; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const own = warnings.units.length;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Gauge className="mt-0.5 size-5 shrink-0 text-brand-ink" aria-hidden="true" />
        <p className="min-w-0 text-sm sm:text-base">
          Se avisa <span className="font-semibold whitespace-nowrap">{formatKm(warnings.generalKm)}</span> antes de que le
          toque (30 días si va por meses).
          {own > 0 && ` ${own === 1 ? "1 unidad tiene" : `${own} unidades tienen`} su propio aviso.`}
        </p>
      </div>
      {canEdit && (
        <>
          <Button type="button" variant="outline" size="touch" className="w-full shrink-0 sm:w-auto" onClick={() => setOpen(true)}>
            Cambiar aviso
          </Button>
          <MaintenanceWarningDialog open={open} onOpenChange={setOpen} warnings={warnings} />
        </>
      )}
    </div>
  );
}

function DueSection({
  id,
  icon,
  title,
  description,
  empty,
  items,
  canRegister,
  canOpenUnits,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  empty: string;
  items: FleetMaintenance[];
  canRegister: boolean;
  canOpenUnits: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="min-w-0 scroll-mt-20">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {icon}
        <h2 id={`${id}-titulo`} className="font-heading text-2xl font-semibold">
          {title}
        </h2>
        <span className="font-heading text-2xl font-semibold text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      <p className="mb-4 text-muted-foreground">{description}</p>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white px-5 py-6 text-center text-muted-foreground">{empty}</p>
      ) : (
        // Cuadro con su propio scroll (hay más secciones debajo); sin overscroll-contain
        // para que al llegar al final siga bajando la página.
        <ul className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto rounded-xl">
          {items.map((m) => (
            <DueCard key={m.id} item={m} canRegister={canRegister} canOpenUnits={canOpenUnits} />
          ))}
        </ul>
      )}
      {items.length > 3 && (
        <p className="mt-2 text-sm text-muted-foreground">Son {items.length}: desliza dentro del cuadro para verlos todos.</p>
      )}
    </section>
  );
}

/** Un mantenimiento para hacer ahora o por programar: abierto, con Registrar a la vista. */
function DueCard({ item: m, canRegister, canOpenUnits }: { item: FleetMaintenance; canRegister: boolean; canOpenUnits: boolean }) {
  const next = describeNext(m);
  return (
    <li
      className={cn(
        "grid shrink-0 grid-cols-1 gap-3 rounded-xl border border-l-4 bg-white px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5",
        EDGE[m.status],
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-heading text-2xl leading-none font-bold tracking-wide text-brand-ink tabular-nums">
            {m.economicNumber}
          </span>
          <span className="min-w-0 text-sm text-muted-foreground">
            {m.unitTypeName}
            {m.currentKm !== null && <span className="whitespace-nowrap"> · {formatKm(m.currentKm)}</span>}
          </span>
        </div>
        <p className="min-w-0 font-heading text-lg leading-tight font-semibold">{m.name}</p>
        <p className="text-base">
          <span className={LEFT_TEXT[m.status]}>{describeLeft(m)}.</span>
          {next && ` ${next}.`}
        </p>
        <p className="text-sm text-muted-foreground">
          {describeInterval(m)}
          {m.ownWarning && m.everyKm !== null && <>. Aviso propio de esta unidad: {formatKm(m.warningKm)}</>}
        </p>
        <MaintenanceLastTime item={m} linkService={canOpenUnits} />
      </div>
      {(canRegister || canOpenUnits) && (
        <div className="flex flex-col gap-2 sm:items-end">
          {canRegister && (
            <Link prefetch={false}
              href={registerMaintenanceHref(m)}
              className={cn(buttonVariants({ variant: "default", size: "touch" }), "w-full sm:w-auto")}
            >
              <ClipboardPlus aria-hidden="true" />
              Registrar
            </Link>
          )}
          {canOpenUnits && (
            <Link prefetch={false}
              href={`/unidades/${m.unitId}`}
              className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-brand-ink underline-offset-4 hover:underline"
            >
              Ver la ficha de {m.economicNumber}
            </Link>
          )}
        </div>
      )}
    </li>
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
              <Link prefetch={false}
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
                      <span className={LEFT_TEXT[m.status]}>{describeLeft(m)}.</span>
                    </p>
                    <MaintenanceLastTime item={m} linkService={canOpenUnits} />
                  </div>
                  {canRegister && (
                    <Link prefetch={false}
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
