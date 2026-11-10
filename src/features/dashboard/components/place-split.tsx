import { formatMoney, toCents } from "@/lib/utils/format";

import { PLACE_KIND_COLORS, PLACE_KIND_LABELS, PLACE_KINDS, placeKindTotals, type PlaceKind, type Report } from "../types";

import { RankedBars } from "./ranked-bars";

const percent = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Swatch({ kind }: { kind: PlaceKind }) {
  return <span aria-hidden="true" className="size-3 shrink-0 rounded-[3px]" style={{ backgroundColor: PLACE_KIND_COLORS[kind] }} />;
}

const MAIN: readonly PlaceKind[] = ["taller_propio", "taller_externo", "en_camino"];

/**
 * ¿Dónde se hizo? (5G): cuánto se gastó en trabajos de Taller Realso, de
 * talleres de fuera y en camino (barra al 100 % y tres bloques), y qué talleres
 * de fuera se llevaron más. Los servicios de antes de la 5G, sin dato, van en
 * una línea aparte.
 */
export function PlaceSplit({ report }: { report: Report }) {
  const kinds = placeKindTotals(report.byPlace);
  const cents = (k: PlaceKind) => toCents(kinds[k].total) ?? 0;
  const grand = toCents(report.total) || 1;
  const share = (c: number) => percent.format(c / grand);
  const visible = PLACE_KINDS.filter((k) => cents(k) > 0);

  if (visible.length === 0) return <p className="py-6 text-center text-muted-foreground">Sin gastos en este periodo.</p>;

  return (
    <div className="grid gap-5">
      {/* Barra al 100 %: separación de 2 px entre partes. */}
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {visible.map((k) => (
          <div key={k} style={{ width: `${(cents(k) / grand) * 100}%`, backgroundColor: PLACE_KIND_COLORS[k] }} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {MAIN.map((k) => (
          <div key={k} className="min-w-0 rounded-lg border p-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Swatch kind={k} />
              {PLACE_KIND_LABELS[k]}
            </p>
            <p className="font-heading text-3xl font-bold whitespace-nowrap tabular-nums">{formatMoney(kinds[k].total)}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {share(cents(k))} del total · {plural(kinds[k].services, "servicio", "servicios")}
            </p>
          </div>
        ))}
      </div>

      {cents("sin_dato") > 0 && (
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Swatch kind="sin_dato" />
          <span className="min-w-0 flex-1">
            Sin dato: {plural(kinds.sin_dato.services, "servicio", "servicios")} de antes de que se preguntara dónde se hizo
          </span>
          <span className="whitespace-nowrap tabular-nums">{formatMoney(kinds.sin_dato.total)}</span>
          <span className="w-12 shrink-0 text-right whitespace-nowrap tabular-nums">{share(cents("sin_dato"))}</span>
        </p>
      )}

      {report.byWorkshop.length > 0 && (
        <div className="border-t pt-5 print:pt-3">
          <h3 className="mb-3 font-heading text-lg font-semibold">Talleres de fuera</h3>
          <RankedBars
            grandTotal={report.total}
            columns={2}
            items={report.byWorkshop.map((t) => ({
              key: t.id,
              label: t.name,
              detail:
                plural(t.services, "servicio", "servicios") +
                (t.onTheRoad === 0
                  ? ""
                  : t.onTheRoad < t.services
                    ? `, ${t.onTheRoad} en camino`
                    : t.services === 1
                      ? ", en camino"
                      : ", todos en camino"),
              total: t.total,
            }))}
          />
        </div>
      )}
    </div>
  );
}
