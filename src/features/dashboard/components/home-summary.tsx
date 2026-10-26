import { BarChart3 } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { toCents, todayInTijuana } from "@/lib/utils/format";

import { getReport } from "../queries";
import { monthLongLabel, resolvePeriod } from "../schemas";

import { KpiRow } from "./kpi-row";
import { RankedBars } from "./ranked-bars";

/** Inicio del admin y el gerente: el mes en curso y las 3 unidades con más gasto. */
export async function HomeSummary() {
  const today = todayInTijuana();
  const period = resolvePeriod({ periodo: "este-mes" }, today);
  const report = await getReport(period, {}, 3);
  const month = monthLongLabel(today.slice(0, 7));

  return (
    <div className="space-y-6">
      <KpiRow report={report} periodLabel={`en ${month}`} />

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-heading text-xl font-semibold">Unidades con más gasto este mes</h2>
        <div className="mt-4">
          {(toCents(report.total) ?? 0) === 0 ? (
            <p className="text-muted-foreground">Todavía no hay gastos registrados este mes.</p>
          ) : (
            <RankedBars
              grandTotal={report.total}
              items={report.byUnit.map((u) => ({
                key: u.id,
                label: u.economicNumber,
                detail: UNIT_TYPE_LABELS[u.type],
                total: u.total,
                href: `/unidades/${u.id}`,
              }))}
            />
          )}
        </div>
        <Link href="/dashboard" className={`${buttonVariants({ size: "touch" })} mt-6 w-full sm:w-auto`}>
          <BarChart3 aria-hidden="true" />
          Ver reportes completos
        </Link>
      </section>
    </div>
  );
}

export function HomeSummarySkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando resumen">
      <div className="h-36 animate-pulse rounded-xl bg-muted" />
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
