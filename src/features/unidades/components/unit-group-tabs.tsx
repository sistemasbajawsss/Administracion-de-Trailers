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
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {UNIT_GROUPS.map((group) => {
          const active = group === current;
          return (
            <li key={group}>
              <Link
                href={group === "local" ? "/unidades" : `/unidades?grupo=${group}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 border-b-2 px-4 text-base font-medium whitespace-nowrap transition-colors outline-none",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-brand-cyan text-brand-ink"
                    : "border-transparent text-muted-foreground hover:text-brand-ink",
                )}
              >
                {UNIT_GROUP_LABELS[group]}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs tabular-nums",
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
