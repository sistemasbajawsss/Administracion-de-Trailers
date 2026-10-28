import Image from "next/image";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { formatDate, formatDateTime, formatMoney, toCents } from "@/lib/utils/format";

import { getReport } from "../queries";
import { GROUP_LABELS, monthLongLabel, type ReportFilters, type ResolvedPeriod } from "../schemas";

import { GroupSplit } from "./group-split";
import { KpiRow } from "./kpi-row";
import { MonthlyChartLoader } from "./monthly-chart-loader";
import { PrintMonthlyBars } from "./print-monthly-bars";
import { RankedBars } from "./ranked-bars";

function Panel({ title, description, children, className = "" }: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border bg-white p-5 print:break-inside-avoid print:p-3 ${className}`}>
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Encabezado que solo sale en papel / PDF: qué es, de cuándo y con qué filtros. */
function PrintHeader({ period, filters }: { period: ResolvedPeriod; filters: ReportFilters }) {
  const details = [
    `${period.label}: ${formatDate(period.from)} al ${formatDate(period.to)}`,
    filters.grupo ? GROUP_LABELS[filters.grupo] : "Todos los grupos",
    filters.tipo ? UNIT_TYPE_LABELS[filters.tipo] : "Todos los tipos",
  ];
  return (
    <header className="hidden items-end justify-between gap-6 border-b-2 border-brand-ink pb-3 print:flex">
      <div>
        <p className="font-heading text-2xl font-bold">Reporte de gastos de la flotilla</p>
        <p className="text-sm">{details.join(" · ")}</p>
        <p className="text-xs text-muted-foreground">Generado el {formatDateTime(new Date().toISOString())}</p>
      </div>
      <Image src="/brand/logo.png" alt="Baja Wastewater Solutions" width={397} height={141} className="h-auto w-36" />
    </header>
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
    <div className="space-y-6 print:space-y-3">
      <PrintHeader period={period} filters={filters} />
      <KpiRow report={report} periodLabel={period.label} />

      {/*
        Una cuadrícula de 6 columnas para todo; cada tarjeta dice cuánto ocupa:
        - Pantalla ancha: mes 4 + grupos 2 / categorías 3 + unidades 3 / proveedores 6.
        - Hoja vertical: mes 6 / grupos 3 + proveedores 3 / categorías 3 + unidades 3.
        - Hoja horizontal: mes 4 + grupos 2 (hoja 1) / categorías, unidades y proveedores 2 + 2 + 2 (hoja 2).
      */}
      <div className="grid gap-6 lg:grid-cols-6 print:grid-cols-6 print:gap-3">
        <Panel
          title="Gasto por mes"
          description={range}
          className="lg:col-span-4 print:order-1 print:portrait:col-span-6 print:landscape:col-span-4"
        >
          <div className="print:hidden">
            <MonthlyChartLoader data={months} />
          </div>
          <div className="hidden print:block">
            <PrintMonthlyBars months={months} />
          </div>
          <details className="mt-3 text-sm print:hidden">
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
                    <td className="py-1.5 text-right whitespace-nowrap">{m.services}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">{formatMoney(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Panel>

        <Panel
          title="Por grupo y tipo"
          description="Parte del total."
          className="lg:col-span-2 print:order-2 print:portrait:col-span-3 print:landscape:col-span-2"
        >
          <GroupSplit byGroup={report.byGroup} total={report.total} />
          <div className="mt-5 border-t pt-5 print:mt-3 print:pt-3">
            <RankedBars
              grandTotal={report.total}
              items={report.byType.map((t) => ({ key: t.type, label: UNIT_TYPE_LABELS[t.type], total: t.total }))}
            />
          </div>
        </Panel>

        <Panel
          title="Por categoría"
          description="En qué se va el dinero."
          className="lg:col-span-3 print:order-4 print:col-span-3 print:landscape:order-3 print:landscape:col-span-2 print:landscape:break-before-page"
        >
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

        <Panel
          title="Unidades con más gasto"
          description="Toca una para ver su ficha."
          className="lg:col-span-3 print:order-5 print:col-span-3 print:landscape:order-4 print:landscape:col-span-2"
        >
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

        <Panel
          title="Proveedores y talleres"
          description="Dónde se hacen los servicios."
          className="lg:col-span-6 print:order-3 print:portrait:col-span-3 print:landscape:order-5 print:landscape:col-span-2"
        >
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
