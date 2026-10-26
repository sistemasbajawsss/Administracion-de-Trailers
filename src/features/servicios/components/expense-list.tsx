import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { formatMoney } from "@/lib/utils/format";

import { EXPENSES_BATCH_SIZE, getExpenseSummary, listExpenses } from "../queries";
import type { ServiceFilters } from "../schemas";

import { ExpenseFeed } from "./expense-feed";

/**
 * Gastos filtrados (un renglón por gasto) con el total de lo filtrado arriba.
 * El total y la primera tanda se piden en paralelo; el resto llega con el scroll.
 */
export async function ExpenseList({
  filters,
  unitId,
  emptyAction,
}: {
  filters: ServiceFilters;
  unitId?: string;
  emptyAction?: ReactNode;
}) {
  const query = { q: unitId ? "" : filters.q, buscar: filters.buscar, desde: filters.desde, hasta: filters.hasta };
  const [summary, items] = await Promise.all([
    getExpenseSummary({ ...query, unitId }),
    listExpenses({ ...query, unitId }),
  ]);
  const filtered = Boolean(query.q || query.buscar || query.desde || query.hasta);

  if (items.length === 0) {
    return (
      <EmptyState
        title={filtered ? "Ningún gasto coincide con los filtros" : "Todavía no hay gastos"}
        description={
          filtered
            ? "Cambia la categoría, la unidad o el rango de fechas."
            : "Los gastos de los servicios capturados aparecerán aquí con su factura."
        }
        action={filtered ? undefined : emptyAction}
      />
    );
  }

  return (
    <>
      <p className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite">
        <span className="font-heading text-3xl font-bold text-brand-ink tabular-nums">{formatMoney(summary.total)}</span>
        <span className="text-muted-foreground">
          {filtered ? "en" : "en total,"} {summary.count} {summary.count === 1 ? "gasto" : "gastos"}
          {filtered && " con estos filtros"}
        </span>
      </p>
      <ExpenseFeed
        key={JSON.stringify(query)}
        initialItems={items}
        totalCount={summary.count}
        batchSize={EXPENSES_BATCH_SIZE}
        filters={query}
        unitId={unitId}
        showUnit={!unitId}
      />
    </>
  );
}

export function ExpenseListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando gastos">
      <div className="mb-3 h-9 w-56 animate-pulse rounded bg-muted" />
      <div className="overflow-hidden rounded-xl border bg-white">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex h-16 items-center gap-4 border-b px-5 last:border-b-0">
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
