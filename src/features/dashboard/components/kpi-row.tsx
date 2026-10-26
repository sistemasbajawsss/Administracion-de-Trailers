import { TrendingDown, TrendingUp } from "lucide-react";

import { formatCents, formatMoney, toCents } from "@/lib/utils/format";

import type { Report } from "../types";

const percent = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 0, signDisplay: "always" });
const count = new Intl.NumberFormat("es-MX");

/** Comparación contra el periodo anterior del mismo largo. Gastar más es la mala noticia. */
function Delta({ total, previous }: { total: string; previous: string }) {
  const now = toCents(total) ?? 0;
  const before = toCents(previous) ?? 0;
  if (before === 0) {
    return <p className="mt-2 text-sm text-white/70">Sin gastos en el periodo anterior para comparar.</p>;
  }
  const change = (now - before) / before;
  const up = change > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-sm text-white/85">
      <Icon className="size-4" aria-hidden="true" />
      <span>
        <span className="font-semibold">{percent.format(change)}</span>
        {up ? " más" : " menos"} que el periodo anterior ({formatMoney(previous)})
      </span>
    </p>
  );
}

/** Cifras clave: el total como cifra principal y tres datos de apoyo. */
export function KpiRow({ report, periodLabel }: { report: Report; periodLabel: string }) {
  const totalCents = toCents(report.total) ?? 0;
  const perUnit = report.units ? Math.round(totalCents / report.units) : 0;

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
      <div className="col-span-2 bg-brand-ink px-5 py-5 text-white">
        <dt className="text-sm text-white/75">Total invertido · {periodLabel}</dt>
        <dd>
          <span className="block font-heading text-5xl leading-tight font-bold">{formatMoney(report.total)}</span>
          <Delta total={report.total} previous={report.previousTotal} />
        </dd>
      </div>
      <div className="bg-white px-5 py-5">
        <dt className="text-sm text-muted-foreground">Servicios</dt>
        <dd className="font-heading text-3xl font-semibold">{count.format(report.services)}</dd>
        <dd className="text-sm text-muted-foreground">{count.format(report.expenses)} gastos</dd>
      </div>
      <div className="bg-white px-5 py-5">
        <dt className="text-sm text-muted-foreground">Promedio por unidad</dt>
        <dd className="font-heading text-3xl font-semibold">{formatCents(perUnit)}</dd>
        <dd className="text-sm text-muted-foreground">
          {count.format(report.units)} {report.units === 1 ? "unidad" : "unidades"} con gastos
        </dd>
      </div>
    </dl>
  );
}
