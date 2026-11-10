import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { HomePanel, HomePanelEmpty } from "@/components/shared/home-panel";
import { buttonVariants } from "@/components/ui/button";

import { getUnitTypes, listUnitsInShop } from "../queries";
import { UNIT_OPERATION_LABELS, unitTypeName } from "../types";

/** Días completos entre dos fechas "aaaa-mm-dd" (sin zonas horarias). */
function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000));
}

/**
 * Unidades en taller ahora mismo (Inicio del admin y el gerente), de sus entradas
 * abiertas: la que lleva más días primero, con su falla. Una semana o más, en ámbar.
 */
export async function UnitsInShopPanel({ today, rows = 3, className }: { today: string; rows?: number; className?: string }) {
  const [units, types] = await Promise.all([listUnitsInShop(), getUnitTypes()]);

  return (
    <HomePanel
      title="Unidades en taller"
      count={units.length}
      className={className}
      footer={
        <Link href="/taller" className={`${buttonVariants({ variant: "outline", size: "touch" })} w-full sm:w-auto`}>
          {units.length > rows ? `Ver las ${units.length} en Taller` : "Ver Taller"}
        </Link>
      }
    >
      {units.length === 0 ? (
        <HomePanelEmpty>Ninguna unidad está en taller.</HomePanelEmpty>
      ) : (
        <>
          <ul className="divide-y">
            {units.slice(0, rows).map((unit) => {
              const days = daysBetween(unit.entryDate, today);
              return (
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
                        {unitTypeName(types, unit.type)}
                        {unit.operation && ` · ${UNIT_OPERATION_LABELS[unit.operation]}`}
                      </span>
                      {/* Completa, sin "…": baja de renglón si no cabe. */}
                      <span className="block whitespace-pre-line text-muted-foreground">{unit.fault}</span>
                    </span>
                    <span
                      className={`shrink-0 text-right text-sm font-semibold whitespace-nowrap tabular-nums ${days >= 7 ? "text-amber-800" : ""}`}
                    >
                      {days === 0 ? "Hoy" : days === 1 ? "1 día" : `${days} días`}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </HomePanel>
  );
}
