import Link from "next/link";
import { cn } from "cn";

import { countUnitsByGroup } from "../queries";
import { UNIT_GROUP_LABELS, UNIT_GROUPS, type UnitGroup } from "../types";

/**
 * Pestañas Locales / Foráneos / Camionetas como enlaces: cambiar de grupo
 * limpia los filtros y el botón "atrás" funciona.
 */
export async function UnitGroupTabs({ current }: { current: UnitGroup }) {
  const counts = await countUnitsByGroup();

  return (
    <nav aria-label="Grupos de unidades" className="mb-6 border-b">
      {/* En el celular las tres pestañas se reparten el ancho: sin scroll lateral. */}
      <ul className="-mb-px grid grid-cols-3 gap-1 sm:flex">
        {UNIT_GROUPS.map((group) => {
          const active = group === current;
          return (
            <li key={group} className="min-w-0">
              <Link
                href={group === "local" ? "/unidades" : `/unidades?grupo=${group}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 border-b-2 px-1 text-sm font-medium transition-colors outline-none sm:justify-start sm:gap-2 sm:px-4 sm:text-base",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-brand-cyan text-brand-ink"
                    : "border-transparent text-muted-foreground hover:text-brand-ink",
                )}
              >
                <span className="truncate">{UNIT_GROUP_LABELS[group]}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums",
                    active ? "bg-brand-cyan text-white" : "bg-muted",
                  )}
                >
                  {counts[group]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function UnitGroupTabsSkeleton() {
  return <div className="mb-6 h-11 border-b" aria-hidden="true" />;
}
