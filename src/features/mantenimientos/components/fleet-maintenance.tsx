import { ClipboardPlus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { cn } from "@/lib/utils";
import { formatKm } from "@/lib/utils/format";

import {
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
import { MaintenanceStatusBadge } from "./maintenance-status-badge";

/** Para los botones de filtro (plural). */
const FILTER_LABELS: Record<MaintenanceStatus, string> = {
  vencido: "Vencidos",
  por_vencer: "Por vencer",
  al_corriente: "Al corriente",
  sin_kilometraje: "Sin kilometraje",
};

const EMPTY_FILTER: Record<MaintenanceStatus, string> = {
  vencido: "Ningún mantenimiento vencido.",
  por_vencer: "Ningún mantenimiento por vencer.",
  al_corriente: "Ningún mantenimiento al corriente.",
  sin_kilometraje: "Todas las unidades con mantenimientos por km tienen kilometraje.",
};

type Group = { unitId: string; economicNumber: string; unitType: FleetMaintenance["unitType"]; km: number | null; items: FleetMaintenance[] };

/**
 * Pestaña Correctivos (5F): lo que le toca a cada unidad y cuánto le falta, en
 * rojo / ámbar / verde. Las unidades con algo vencido van primero. "Registrar"
 * abre el servicio con la unidad, el tipo y el mantenimiento ya puestos.
 */
export function FleetMaintenanceList({
  items,
  status,
  canRegister,
  canOpenUnits,
}: {
  items: FleetMaintenance[];
  status: MaintenanceStatus | undefined;
  /** Admin y capturista registran servicios. */
  canRegister: boolean;
  /** Admin y gerente ven la ficha de la unidad y todos los servicios. */
  canOpenUnits: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Aún no hay mantenimientos programados"
        description={
          canOpenUnits
            ? "Se agregan en la ficha de cada unidad: nombre y cada cuántos km o meses."
            : "Cuando el administrador los programe en cada unidad, aquí verás lo que le toca a cada una."
        }
        action={
          canOpenUnits ? (
            <Link href="/unidades" className={buttonVariants({ variant: "outline", size: "touch" })}>
              Ir a Unidades
            </Link>
          ) : undefined
        }
      />
    );
  }

  const counts = Object.fromEntries(MAINTENANCE_STATUSES.map((s) => [s, items.filter((m) => m.status === s).length])) as Record<
    MaintenanceStatus,
    number
  >;
  const shown = status ? items.filter((m) => m.status === status) : items;

  // Agrupado por unidad (ya viene en el orden de la lista de unidades); lo más urgente arriba.
  const groups: Group[] = [];
  for (const item of shown) {
    const last = groups.at(-1);
    if (last?.unitId === item.unitId) last.items.push(item);
    else
      groups.push({
        unitId: item.unitId,
        economicNumber: item.economicNumber,
        unitType: item.unitType,
        km: item.currentKm,
        items: [item],
      });
  }
  const worst = (g: Group) => Math.min(...g.items.map((m) => MAINTENANCE_STATUS_ORDER[m.status]));
  groups.sort((a, b) => worst(a) - worst(b));

  const filters: { href: string; label: string; count: number; active: boolean }[] = [
    { href: "/mantenimientos", label: "Todos", count: items.length, active: !status },
    ...MAINTENANCE_STATUSES.filter((s) => counts[s] > 0 || s === status).map((s) => ({
      href: `/mantenimientos?estado=${s}`,
      label: FILTER_LABELS[s],
      count: counts[s],
      active: s === status,
    })),
  ];

  return (
    <>
      <nav aria-label="Filtrar por estado" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <li key={f.href}>
              <Link
                href={f.href}
                aria-current={f.active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors outline-none",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  f.active ? "border-brand-ink bg-brand-ink text-white" : "bg-white hover:border-brand-ink/40",
                )}
              >
                {f.label}
                <span className={cn("tabular-nums", f.active ? "text-white/80" : "text-muted-foreground")}>{f.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {groups.length === 0 ? (
        <p className="rounded-xl border bg-white px-5 py-8 text-center text-muted-foreground">
          {status ? EMPTY_FILTER[status] : ""}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((group) => (
            <li key={group.unitId} className="min-w-0 overflow-hidden rounded-xl border bg-white">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b bg-muted/40 px-4 py-3 sm:px-5">
                <h2 className="font-heading text-2xl leading-none font-bold tracking-wide text-brand-ink tabular-nums">
                  {canOpenUnits ? (
                    <Link href={`/unidades/${group.unitId}`} className="underline-offset-4 hover:underline">
                      {group.economicNumber}
                    </Link>
                  ) : (
                    group.economicNumber
                  )}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {UNIT_TYPE_LABELS[group.unitType]}
                  {group.km !== null && <span className="whitespace-nowrap"> · Hoy marca {formatKm(group.km)}</span>}
                </p>
              </div>
              <ul className="divide-y">
                {group.items.map((m) => {
                  const next = describeNext(m);
                  return (
                    <li
                      key={m.id}
                      className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
                    >
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
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
