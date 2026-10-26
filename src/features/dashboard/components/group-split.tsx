import { formatMoney, toCents } from "@/lib/utils/format";

import { GROUPS, GROUP_LABELS, type Group } from "../schemas";
import type { Report } from "../types";

/**
 * Color por grupo, fijo (nunca por posición en el ranking): el cian queda en medio
 * para que ningún par vecino falle con daltonismo (validado con la skill dataviz:
 * verde↔cian ΔE 26, cian↔naranja ΔE 18.5). El verde tiene poco contraste con el
 * blanco: por eso cada grupo lleva su nombre y monto en texto.
 */
const GROUP_COLORS: Record<Group, string> = {
  local: "#7ab648",
  foraneo: "#0b7fb0",
  camionetas: "#eb6834",
};

const percent = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });

/** Parte del total por grupo: una barra apilada con 2 px de aire entre segmentos y su leyenda. */
export function GroupSplit({ byGroup, total }: { byGroup: Report["byGroup"]; total: string }) {
  const grand = toCents(total) ?? 0;
  if (grand === 0) return <p className="py-6 text-center text-muted-foreground">Sin gastos en este periodo.</p>;

  // Orden fijo (locales, foráneos, camionetas), no por monto.
  const parts = GROUPS.map((group) => {
    const row = byGroup.find((g) => g.group === group);
    return { group, total: row?.total ?? "0", cents: toCents(row?.total ?? "0") ?? 0 };
  });

  return (
    <div>
      <div className="flex h-6 gap-0.5" role="img" aria-label="Parte del gasto por grupo de unidades">
        {parts
          .filter((part) => part.cents > 0)
          .map((part, index, visible) => (
            <div
              key={part.group}
              className={`h-full ${index === 0 ? "rounded-l-sm" : ""} ${index === visible.length - 1 ? "rounded-r-sm" : ""}`}
              style={{ width: `${(part.cents / grand) * 100}%`, backgroundColor: GROUP_COLORS[part.group] }}
            />
          ))}
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {parts.map((part) => (
          <li key={part.group} className="flex items-start gap-2">
            <span className="mt-1.5 size-3 shrink-0 rounded-sm" style={{ backgroundColor: GROUP_COLORS[part.group] }} aria-hidden="true" />
            <span>
              <span className="block font-medium">{GROUP_LABELS[part.group]}</span>
              <span className="block tabular-nums">{formatMoney(part.total)}</span>
              <span className="block text-sm text-muted-foreground">{percent.format(part.cents / grand)} del total</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
