import { formatDate, formatKm, formatMoney, formatRate, formatUsd } from "@/lib/utils/format";
import { UNIT_TYPE_LABELS } from "@/features/unidades/types";

import type { ServiceDetail } from "../types";

import { EditedBadge } from "./edited-badge";

/**
 * Detalle de un servicio como un ticket: unidad y total arriba, renglones de
 * gasto en medio y el total oficial (sumado en la BD) al pie.
 */
export function ServiceDetailView({ service }: { service: ServiceDetail }) {
  return (
    <article className="overflow-hidden rounded-xl border bg-white">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b px-5 py-5 sm:px-6">
        <div>
          <p className="font-heading text-5xl leading-none font-bold tracking-wide text-brand-ink tabular-nums">
            {service.unit.economicNumber}
          </p>
          <p className="mt-2 text-muted-foreground">
            {UNIT_TYPE_LABELS[service.unit.type]} · {formatDate(service.date)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-heading text-4xl leading-none font-bold tabular-nums">{formatMoney(service.total)}</p>
          {service.edited && <EditedBadge />}
        </div>
      </header>

      <dl className="grid gap-x-6 gap-y-4 border-b px-5 py-5 sm:grid-cols-3 sm:px-6">
        <div>
          <dt className="text-sm text-muted-foreground">Proveedor o taller</dt>
          <dd className="text-base">{service.supplierName ?? "Sin proveedor"}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Kilometraje</dt>
          <dd className="text-base tabular-nums">
            {service.mileage != null ? formatKm(service.mileage) : service.unit.type === "caja" ? "No aplica" : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Gastos</dt>
          <dd className="text-base">{service.expenseCount}</dd>
        </div>
        {service.description && (
          <div className="sm:col-span-3">
            <dt className="text-sm text-muted-foreground">Descripción</dt>
            <dd className="text-base whitespace-pre-line wrap-anywhere">{service.description}</dd>
          </div>
        )}
      </dl>

      <ul className="divide-y px-5 sm:px-6">
        {service.expenses.map((expense) => (
          <li key={expense.id} className="flex items-baseline gap-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{expense.categoryName}</span>
              {expense.concept && <span className="block text-muted-foreground">{expense.concept}</span>}
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-base tabular-nums">{formatMoney(expense.amount)}</span>
              {expense.usd && (
                <span className="block text-sm text-muted-foreground tabular-nums">
                  {formatUsd(expense.usd.amount)} a {formatRate(expense.usd.rate)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <footer className="flex items-baseline justify-between border-t-2 border-brand-ink bg-muted/40 px-5 py-4 sm:px-6">
        <span className="font-heading text-lg font-semibold">Total con IVA</span>
        <span className="font-heading text-2xl font-bold tabular-nums">{formatMoney(service.total)}</span>
      </footer>
    </article>
  );
}
