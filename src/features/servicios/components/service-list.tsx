import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ListPagination } from "@/components/shared/list-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils/format";

import { listServices, SERVICES_PAGE_SIZE } from "../queries";
import type { ServiceFilters } from "../schemas";
import type { ServiceListItem } from "../types";

import { EditedBadge } from "./edited-badge";

function Summary({ service }: { service: ServiceListItem }) {
  const text = service.description ?? `${service.expenseCount} ${service.expenseCount === 1 ? "gasto" : "gastos"}`;
  return (
    <>
      <span className="block truncate">{text}</span>
      <span className="block truncate text-sm text-muted-foreground">
        {service.supplierName ?? "Sin proveedor"}
      </span>
    </>
  );
}

/**
 * Lista de servicios. Con unitId (ficha de la unidad) no muestra la columna
 * de unidad ni filtros por número económico.
 */
export async function ServiceList({
  filters,
  unitId,
  pathname,
  emptyAction,
}: {
  filters: ServiceFilters;
  unitId?: string;
  pathname: string;
  emptyAction?: ReactNode;
}) {
  const { services, total } = await listServices({ ...filters, unitId });
  const showUnit = !unitId;

  if (services.length === 0) {
    const filtered = Boolean(filters.q || filters.desde || filters.hasta);
    return (
      <EmptyState
        title={filtered ? "Ningún servicio coincide con los filtros" : "Todavía no hay servicios"}
        description={
          filtered
            ? "Cambia la unidad o el rango de fechas para ver más servicios."
            : "Los servicios capturados aparecerán aquí con su total."
        }
        action={filtered ? undefined : emptyAction}
      />
    );
  }

  const href = (id: string) => `/servicios/${id}`;

  return (
    <>
      {/* Escritorio: tabla */}
      <div className="hidden overflow-hidden rounded-lg border bg-white md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-28 pl-5">Fecha</TableHead>
              {showUnit && <TableHead className="w-24">Unidad</TableHead>}
              <TableHead>Servicio</TableHead>
              <TableHead className="w-36 pr-5 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id} className="relative">
                <TableCell className="py-3 pl-5 text-base tabular-nums">
                  {/* El enlace cubre todo el renglón. */}
                  <Link href={href(service.id)} className="outline-none after:absolute after:inset-0 focus-visible:underline">
                    {formatDate(service.date)}
                  </Link>
                </TableCell>
                {showUnit && (
                  <TableCell>
                    <span className="font-heading text-xl font-bold tracking-wide text-brand-ink tabular-nums">
                      {service.unit.economicNumber}
                    </span>
                  </TableCell>
                )}
                <TableCell className="max-w-0 text-base">
                  <Summary service={service} />
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <span className="block text-base font-semibold tabular-nums">{formatMoney(service.total)}</span>
                  {service.edited && <EditedBadge />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Celular */}
      <ul className="divide-y overflow-hidden rounded-lg border bg-white md:hidden">
        {services.map((service) => (
          <li key={service.id}>
            <Link
              href={href(service.id)}
              className="flex min-h-16 items-center gap-4 px-4 py-3 outline-none focus-visible:bg-muted active:bg-muted"
            >
              {showUnit && (
                <span className="w-16 shrink-0 font-heading text-xl font-bold tracking-wide text-brand-ink tabular-nums">
                  {service.unit.economicNumber}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-muted-foreground tabular-nums">{formatDate(service.date)}</span>
                <Summary service={service} />
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold tabular-nums">{formatMoney(service.total)}</span>
                {service.edited && <EditedBadge />}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <ListPagination
        page={filters.pagina}
        total={total}
        pageSize={SERVICES_PAGE_SIZE}
        pathname={pathname}
        params={{ q: filters.q || undefined, desde: filters.desde, hasta: filters.hasta }}
      />
    </>
  );
}

export function ServiceListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-white" aria-busy="true" aria-label="Cargando servicios">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex h-16 items-center gap-4 border-b px-5 last:border-b-0">
          <div className="h-6 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
