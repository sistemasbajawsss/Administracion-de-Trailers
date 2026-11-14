import Image from "next/image";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatDateTime, formatMoney, toCents } from "@/lib/utils/format";

import { getReport } from "../queries";
import { GROUP_LABELS, monthLabel, monthLongLabel, type ReportFilters, type ResolvedPeriod } from "../schemas";
import { SERVICE_KIND_LABELS, SERVICE_KINDS, type ServiceKind } from "../types";

import { GroupSplit } from "./group-split";
import { KindMonthlyChartLoader } from "./kind-monthly-chart-loader";
import { KpiRow } from "./kpi-row";
import { MaintenanceSplit, ServiceKindLegend } from "./maintenance-split";
import { MonthlyChartLoader } from "./monthly-chart-loader";
import { PlaceSplit } from "./place-split";
import { PrintKindMonthlyBars } from "./print-kind-monthly-bars";
import { PrintMonthlyBars } from "./print-monthly-bars";
import { RankedBars } from "./ranked-bars";

function Panel({ title, description, children, className = "" }: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border bg-white p-4 sm:p-5 print:break-inside-avoid print:p-3 ${className}`}>
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Encabezado que solo sale en papel / PDF: qué es, de cuándo y con qué filtros. */
function PrintHeader({
  period,
  filters,
  typeNames,
  monthNote,
}: {
  period: ResolvedPeriod;
  filters: ReportFilters;
  typeNames: Record<string, string>;
  monthNote: string;
}) {
  const details = [
    `${period.label}: ${formatDate(period.from)} al ${formatDate(period.to)}`,
    filters.grupo ? GROUP_LABELS[filters.grupo] : "Todos los grupos",
    filters.tipo ? (typeNames[filters.tipo] ?? filters.tipo) : "Todos los tipos",
  ];
  return (
    <header className="hidden items-end justify-between gap-6 border-b-2 border-brand-ink pb-3 print:flex">
      <div>
        <p className="font-heading text-2xl font-bold">Reporte de gastos de la flotilla</p>
        <p className="text-sm">{details.join(" · ")}</p>
        <p className="text-xs">{monthNote}</p>
        <p className="text-xs text-muted-foreground">Generado el {formatDateTime(new Date().toISOString())}</p>
      </div>
      <Image src="/brand/logo.png" alt="Baja Wastewater Solutions" width={397} height={141} className="h-auto w-36" />
    </header>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Reportes del periodo: cifras clave, gasto por mes y los agrupados, todo de una consulta. */
/** `monthNote` (5I): qué meses del periodo siguen abiertos; lo arma la página. */
export async function ReportView({
  period,
  filters,
  monthNote,
}: {
  period: ResolvedPeriod;
  filters: ReportFilters;
  monthNote: string;
}) {
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
  // Solo los tipos que tienen gasto en el periodo (los de antes, sin tipo, casi siempre).
  const kindsShown = SERVICE_KINDS.filter((k) => report.byMonth.some((m) => (toCents(m.kinds[k]) ?? 0) > 0));
  const kindMonths = report.byMonth.map((m) => ({
    month: m.month,
    total: m.total,
    amounts: m.kinds,
    ...(Object.fromEntries(SERVICE_KINDS.map((k) => [k, (toCents(m.kinds[k]) ?? 0) / 100])) as Record<ServiceKind, number>),
  }));

  return (
    <div className="space-y-6 print:space-y-3">
      <PrintHeader period={period} filters={filters} typeNames={report.typeNames} monthNote={monthNote} />
      <KpiRow report={report} periodLabel={period.label} />
      <p className="text-sm text-muted-foreground print:hidden">{monthNote}</p>

      {/*
        Una cuadrícula de 6 columnas para todo; cada tarjeta dice cuánto ocupa:
        - Pantalla ancha: mes 4 + grupos 2 / mantenimiento 6 / dónde se hizo 6 / categorías 3 + unidades 3 / proveedores 6.
        - Hoja vertical: mes 6 / grupos 3 + proveedores 3 / categorías 3 + unidades 3 / tipo de servicio 3.
        - Hoja horizontal: mes 4 + grupos 2 (hoja 1) / categorías, unidades y proveedores 2 + 2 + 2, tipo de servicio 2 (hoja 2).
      */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-6 print:grid-cols-6 print:gap-3">
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
              items={report.byType.map((t) => ({ key: t.type, label: report.typeNames[t.type] ?? t.type, total: t.total }))}
            />
          </div>
        </Panel>

        <Panel
          title="Mantenimiento y reparaciones"
          description="Correctivo y preventivo contra lo que se descompuso."
          className="lg:col-span-6 print:order-6 print:col-span-6 print:break-before-page"
        >
          <MaintenanceSplit report={report} />
          <div className="mt-6 border-t pt-5 print:mt-3 print:pt-3">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <h3 className="font-heading text-lg font-semibold">Gasto por mes por tipo</h3>
              <ServiceKindLegend kinds={kindsShown} />
            </div>
            <div className="print:hidden">
              <KindMonthlyChartLoader data={kindMonths} kinds={kindsShown} />
            </div>
            <div className="hidden print:block">
              <PrintKindMonthlyBars months={report.byMonth} kinds={kindsShown} />
            </div>
            <details className="mt-3 text-sm print:hidden">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-muted-foreground hover:text-foreground">
                Ver como tabla
              </summary>
              <div className="mt-2 grid grid-cols-1">
                {/* En celular: letra chica y mes corto para que quepan las columnas sin salirse. */}
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 pr-1 font-medium">Mes</th>
                      {kindsShown.map((k) => (
                        <th key={k} className="py-1.5 pl-1 text-right font-medium sm:pl-3">
                          {SERVICE_KIND_LABELS[k]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {report.byMonth.map((m) => (
                      <tr key={m.month} className="border-b last:border-b-0">
                        <td className="py-1.5 pr-1 whitespace-nowrap">
                          <span className="capitalize sm:hidden">{monthLabel(m.month)}</span>
                          <span className="hidden capitalize sm:inline">{monthLongLabel(m.month)}</span>
                        </td>
                        {kindsShown.map((k) => (
                          <td key={k} className="py-1.5 pl-1 text-right whitespace-nowrap sm:pl-3">
                            {formatMoney(m.kinds[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </Panel>

        <Panel
          title="Dónde se hizo"
          description="Trabajos en Taller Realso, en talleres de fuera y en camino."
          className="lg:col-span-6 print:order-7 print:col-span-6"
        >
          <PlaceSplit report={report} />
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
              detail: `${report.typeNames[u.type] ?? u.type} · ${GROUP_LABELS[u.group] ?? ""}`,
              total: u.total,
              href: `/unidades/${u.id}`,
            }))}
          />
        </Panel>

        <Panel
          title="Proveedores de las piezas"
          description="Dónde se compran las piezas."
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-96 animate-pulse rounded-xl bg-muted lg:col-span-2" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
