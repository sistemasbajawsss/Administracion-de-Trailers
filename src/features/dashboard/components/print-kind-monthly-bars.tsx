import { toCents } from "@/lib/utils/format";

import { monthLabel } from "../schemas";
import { SERVICE_KIND_COLORS, type Report, type ServiceKind } from "../types";

function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

const compact = (pesos: number) =>
  pesos >= 999_500
    ? `$${(pesos / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} M`
    : pesos >= 1_000
      ? `$${Math.round(pesos / 1_000).toLocaleString("es-MX")} mil`
      : `$${pesos}`;

const TICKS = [1, 0.5, 0];

/**
 * Gasto por mes por tipo para papel / PDF: columnas apiladas en HTML (Recharts
 * puede salir cortado al imprimir), mismo orden y colores que en pantalla.
 */
export function PrintKindMonthlyBars({ months, kinds }: { months: Report["byMonth"]; kinds: readonly ServiceKind[] }) {
  const totals = months.map((m) => toCents(m.total) ?? 0);
  const top = niceMax(Math.max(...totals, 0) / 100);
  const pct = (cents: number) => `${(cents / 100 / top) * 100}%`;

  return (
    <div className="flex gap-2">
      <div className="relative h-44 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
        <span className="invisible block">{compact(top)}</span>
        {TICKS.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t) * 100}%` }}>
            {compact(top * t)}
          </span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44" aria-hidden="true">
          {TICKS.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border" style={{ top: `${(1 - t) * 100}%` }} />
          ))}
        </div>
        <ol className="relative flex">
          {months.map((m) => (
            <li key={m.month} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex h-44 w-full max-w-6 flex-col-reverse">
                {kinds.map((k) => {
                  const cents = toCents(m.kinds[k]) ?? 0;
                  return cents > 0 ? (
                    <div key={k} className="border-t border-white" style={{ height: pct(cents), backgroundColor: SERVICE_KIND_COLORS[k] }} />
                  ) : null;
                })}
              </div>
              <span className="mt-1 text-[10px] whitespace-nowrap text-muted-foreground">{monthLabel(m.month)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
