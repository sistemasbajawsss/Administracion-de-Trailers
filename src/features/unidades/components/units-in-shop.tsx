import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { HomePanel, HomePanelEmpty } from "@/components/shared/home-panel";

import { listUnitsInShop } from "../queries";
import { UNIT_OPERATION_LABELS, UNIT_TYPE_LABELS } from "../types";

/** Unidades en taller ahora mismo (Inicio del admin y el gerente). */
export async function UnitsInShopPanel() {
  const units = await listUnitsInShop();

  return (
    <HomePanel title="Unidades en taller" count={units.length}>
      {units.length === 0 ? (
        <HomePanelEmpty>Ninguna unidad está en taller.</HomePanelEmpty>
      ) : (
        <ul className="divide-y">
          {units.map((unit) => (
            <li key={unit.id}>
              <Link
                href={`/unidades/${unit.id}`}
                className="flex min-h-14 items-center gap-3 px-1 py-2 outline-none hover:bg-muted/50 focus-visible:bg-muted"
              >
                <span className="w-14 shrink-0 font-heading text-lg font-bold tracking-wide text-brand-ink tabular-nums">
                  {unit.economicNumber}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block">
                    {UNIT_TYPE_LABELS[unit.type]}
                    {unit.operation && ` · ${UNIT_OPERATION_LABELS[unit.operation]}`}
                  </span>
                  <span className="block truncate text-muted-foreground">{unit.driverName ?? "Sin chofer"}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomePanel>
  );
}
