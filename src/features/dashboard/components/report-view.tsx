import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { formatDate, formatMoney, toCents } from "@/lib/utils/format";

import { getReport } from "../queries";
import { GROUP_LABELS, monthLongLabel, type ReportFilters, type ResolvedPeriod } from "../schemas";

import { GroupSplit } from "./group-split";
import { KpiRow } from "./kpi-row";
import { MonthlyChartLoader } from "./monthly-chart-loader";
import { RankedBars } from "./ranked-bars";

function Panel({ title, description, children, className = "" }: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border bg-white p-5 ${className}`}>
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Reportes del periodo: cifras clave, gasto por mes y los agrupados, todo de una consulta. */
export async function ReportView({ period, filters }: { period: ResolvedPeriod; filters: ReportFilters }) {
  const report = await getReport(period, filters);
  const range = `${formatDate(period.from)} al ${formatDate(period.to)}`;

  if ((toCents(report.total) ?? 0) === 0) {
    return (
      <EmptyState
        title="Sin gastos en este periodo"
        description={`No hay gastos registrados del ${range} con estos filtros. Prueba con otro periodo o quita el grupo o tipo.`}
      />
    );
  }

  const months = report.byMonth.map((m) => ({
    month: m.month,
    value: (toCents(m.total) ?? 0) / 100,
    total: m.total,
    services: m.services,
  }));

  return (
    <div className="space-y-6">
      <KpiRow report={report} periodLabel={period.label} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Gasto por mes" description={range} className="lg:col-span-2">
          <MonthlyChartLoader data={months} />
          <details className="mt-3 text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-muted-foreground hover:text-foreground">
              Ver como tabla
            </summary>
            <table className="mt-2 w-full max-w-md">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 font-medium">Mes</th>
                  <th className="py-1.5 text-right font-medium">Servicios</th>
                  <th className="py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {months.map((m) => (
                  <tr key={m.month} className="border-b last:border-b-0">
                    <td className="py-1.5 capitalize">{monthLongLabel(m.month)}</td>
                    <td className="py-1.5 text-right">{m.services}</td>
                    <td className="py-1.5 text-right">{formatMoney(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Panel>

        <Panel title="Por grupo y tipo" description="Parte del total.">
          <GroupSplit byGroup={report.byGroup} total={report.total} />
          <div className="mt-5 border-t pt-5">
            <RankedBars
              grandTotal={report.total}
              items={report.byType.map((t) => ({ key: t.type, label: UNIT_TYPE_LABELS[t.type], total: t.total }))}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Por categoría" description="En qué se va el dinero.">
          <RankedBars
            grandTotal={report.total}
            limit={8}
            items={report.byCategory.map((c) => ({
              key: c.id ?? c.name,
              label: c.name,
              detail: plural(c.expenses, "gasto", "gastos"),
              total: c.total,
            }))}
          />
        </Panel>

        <Panel title="Unidades con más gasto" description="Toca una para ver su ficha.">
          <RankedBars
            grandTotal={report.total}
            limit={8}
            items={report.byUnit.map((u) => ({
              key: u.id,
              label: u.economicNumber,
              detail: `${UNIT_TYPE_LABELS[u.type]} · ${GROUP_LABELS[u.group] ?? ""}`,
              total: u.total,
              href: `/unidades/${u.id}`,
            }))}
          />
        </Panel>
      </div>

      <Panel title="Proveedores y talleres" description="Dónde se hacen los servicios.">
        <RankedBars
          grandTotal={report.total}
          columns={2}
          items={report.bySupplier.map((p) => ({
            key: p.id ?? "sin-proveedor",
            label: p.name,
            detail: plural(p.services, "servicio", "servicios"),
            total: p.total,
          }))}
        />
      </Panel>
    </div>
  );
}

export function ReportViewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando reporte">
      <div className="h-36 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-96 animate-pulse rounded-xl bg-muted lg:col-span-2" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
