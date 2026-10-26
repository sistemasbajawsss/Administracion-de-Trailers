import { formatMoney, toCents } from "@/lib/utils/format";

import { monthLabel } from "../schemas";

/** Escala redonda para el eje: el máximo sube al siguiente 1, 2 o 5 × 10^n. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

const compact = (pesos: number) =>
  pesos >= 1_000_000
    ? `$${(pesos / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} M`
    : pesos >= 1_000
      ? `$${Math.round(pesos / 1_000).toLocaleString("es-MX")} mil`
      : `$${pesos}`;

const TICKS = [1, 0.5, 0];

/**
 * Gasto por mes para papel / PDF. Recharts mide su ancho en la pantalla y al
 * imprimir puede salir cortado; estas columnas son HTML y se ajustan a cualquier
 * hoja, vertical u horizontal. Mismas reglas: una serie en cian, columnas de hasta
 * 24 px con extremo redondeado, cuadrícula de 1 px; solo el mes más alto lleva monto.
 */
export function PrintMonthlyBars({ months }: { months: { month: string; total: string }[] }) {
  const cents = months.map((m) => toCents(m.total) ?? 0);
  const top = niceMax(Math.max(...cents, 0) / 100);
  const peak = cents.indexOf(Math.max(...cents));
  const height = (i: number) => `${(cents[i]! / 100 / top) * 100}%`;

  return (
    // pt-3: aire arriba para el monto del mes más alto.
    <div className="flex gap-2 pt-3">
      {/* Eje: tres marcas redondas. */}
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
          {months.map((m, i) => (
            <li key={m.month} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="relative flex h-44 w-full max-w-6 flex-col justify-end">
                {i === peak && cents[i]! > 0 && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold whitespace-nowrap"
                    style={{ bottom: `calc(${height(i)} + 2px)` }}
                  >
                    {formatMoney(m.total)}
                  </span>
                )}
                <div className="rounded-t-[4px] bg-brand-cyan" style={{ height: height(i) }} />
              </div>
              <span className="mt-1 text-[10px] whitespace-nowrap text-muted-foreground">{monthLabel(m.month)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
