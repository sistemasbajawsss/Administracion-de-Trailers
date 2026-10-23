import { Pencil } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { EmptyState } from "@/components/shared/empty-state";
import { ListPagination } from "@/components/shared/list-pagination";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { listUnits, UNITS_PAGE_SIZE } from "../queries";
import type { UnitFilters } from "../schemas";
import { UNIT_GROUP_LABELS, UNIT_TYPE_LABELS, type UnitListItem } from "../types";

import { UnitStatusBadge } from "./unit-status-badge";

/** "Caja · 53 pies", "Camioneta · Ford F-150". */
function unitDetail(unit: UnitListItem) {
  const parts: string[] = [UNIT_TYPE_LABELS[unit.type]];
  if (unit.lengthFt) parts.push(`${unit.lengthFt} pies`);
  const makeModel = [unit.make, unit.model].filter(Boolean).join(" ");
  if (makeModel) parts.push(makeModel);
  return parts.join(" · ");
}

function EconomicNumber({ value, muted }: { value: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "font-heading text-xl font-bold tracking-wide tabular-nums",
        muted ? "text-muted-foreground line-through decoration-1" : "text-brand-ink",
      )}
    >
      {value}
    </span>
  );
}

function DriverName({ name }: { name: string | null }) {
  return name ? <span>{name}</span> : <span className="text-muted-foreground">Sin chofer</span>;
}

export async function UnitList({ filters }: { filters: UnitFilters }) {
  const { units, total } = await listUnits(filters);

  if (units.length === 0) {
    const filtered = Boolean(filters.q || filters.tipo || filters.estatus || filters.sinChofer);
    return (
      <EmptyState
        title={filtered ? "Ninguna unidad coincide con los filtros" : `No hay unidades en ${UNIT_GROUP_LABELS[filters.grupo]}`}
        description={
          filtered
            ? "Cambia la búsqueda o quita los filtros para ver más unidades."
            : "Da de alta una unidad con el botón Nueva unidad."
        }
      />
    );
  }

  const editHref = (id: string) => `/unidades/${id}/editar`;
  const sheetHref = (id: string) => `/unidades/${id}`;

  return (
    <>
      {/* Escritorio: tabla */}
      <div className="hidden overflow-hidden rounded-lg border bg-white md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-28 pl-5">Número</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Chofer</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead className="w-24 pr-5 text-right">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="py-3 pl-5">
                  <Link
                    href={sheetHref(unit.id)}
                    className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label={`Ficha de ${unit.economicNumber}`}
                  >
                    <EconomicNumber value={unit.economicNumber} muted={unit.status === "baja"} />
                  </Link>
                </TableCell>
                <TableCell className="text-base">
                  {unitDetail(unit)}
                  {unit.notes && (
                    <p className="max-w-md truncate text-sm text-muted-foreground">{unit.notes}</p>
                  )}
                </TableCell>
                <TableCell className="text-base">
                  <DriverName name={unit.driverName} />
                </TableCell>
                <TableCell>
                  <UnitStatusBadge status={unit.status} />
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <Link
                    href={editHref(unit.id)}
                    className={buttonVariants({ variant: "ghost", size: "icon-touch" })}
                    aria-label={`Editar ${unit.economicNumber}`}
                  >
                    <Pencil />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Celular: lista tocable, cada renglón abre la ficha */}
      <ul className="divide-y overflow-hidden rounded-lg border bg-white md:hidden">
        {units.map((unit) => (
          <li key={unit.id}>
            <Link
              href={sheetHref(unit.id)}
              className="flex min-h-16 items-center gap-4 px-4 py-3 outline-none focus-visible:bg-muted active:bg-muted"
            >
              <span className="w-16 shrink-0">
                <EconomicNumber value={unit.economicNumber} muted={unit.status === "baja"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{unitDetail(unit)}</span>
                <span className="block truncate text-sm">
                  <DriverName name={unit.driverName} />
                </span>
              </span>
              <UnitStatusBadge status={unit.status} />
            </Link>
          </li>
        ))}
      </ul>

      <ListPagination
        page={filters.pagina}
        total={total}
        pageSize={UNITS_PAGE_SIZE}
        pathname="/unidades"
        params={{
          grupo: filters.grupo === "local" ? undefined : filters.grupo,
          q: filters.q || undefined,
          tipo: filters.tipo,
          estatus: filters.estatus,
          sinChofer: filters.sinChofer,
        }}
      />
    </>
  );
}

export function UnitListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-white" aria-busy="true" aria-label="Cargando unidades">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex h-16 items-center gap-4 border-b px-5 last:border-b-0">
          <div className="h-6 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="hidden h-4 w-32 animate-pulse rounded bg-muted md:block" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}
