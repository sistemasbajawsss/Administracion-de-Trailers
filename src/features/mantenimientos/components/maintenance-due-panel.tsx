import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { HomePanel, HomePanelEmpty } from "@/components/shared/home-panel";
import { cn } from "@/lib/utils";

import { listFleetMaintenance } from "../queries";
import { describeLeft, MAINTENANCE_STATUS_ORDER, registerMaintenanceHref } from "../types";

import { MaintenanceStatusBadge } from "./maintenance-status-badge";

/** Cuántos se muestran en la tarjeta; el resto, en la página Mantenimientos. */
const SHOWN = 8;

/**
 * Aviso de Inicio (5F): mantenimientos vencidos y por vencer de toda la flotilla,
 * lo vencido primero. El admin y el gerente abren la ficha de la unidad; el
 * capturista, el servicio ya preparado para registrarlo.
 */
export async function MaintenanceDuePanel({ openUnits }: { openUnits: boolean }) {
  const due = (await listFleetMaintenance())
    .filter((m) => m.status === "vencido" || m.status === "por_vencer")
    // Estable: dentro de cada estado se conserva el orden de la lista de unidades.
    .sort((a, b) => MAINTENANCE_STATUS_ORDER[a.status] - MAINTENANCE_STATUS_ORDER[b.status]);
  const overdue = due.filter((m) => m.status === "vencido").length;

  return (
    <HomePanel
      title="Mantenimientos"
      count={due.length}
      description={
        due.length
          ? `${overdue === 1 ? "1 vencido" : `${overdue} vencidos`} y ${due.length - overdue} por vencer.`
          : undefined
      }
    >
      {due.length === 0 ? (
        <HomePanelEmpty>Ningún mantenimiento vencido ni por vencer.</HomePanelEmpty>
      ) : (
        <>
          <ul className="divide-y">
            {due.slice(0, SHOWN).map((m) => (
              <li key={m.id}>
                <Link
                  href={openUnits ? `/unidades/${m.unitId}` : registerMaintenanceHref(m)}
                  className="flex min-h-14 items-center gap-3 px-1 py-2 outline-none hover:bg-muted/50 focus-visible:bg-muted"
                >
                  <span className="w-14 shrink-0 font-heading text-lg font-bold tracking-wide text-brand-ink tabular-nums">
                    {m.economicNumber}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{m.name}</span>
                    <span
                      className={cn("block", m.status === "vencido" ? "text-red-800" : "text-amber-800")}
                    >
                      {describeLeft(m)}
                    </span>
                  </span>
                  <MaintenanceStatusBadge status={m.status} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/mantenimientos"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-cyan"
          >
            {due.length > SHOWN ? `Ver los ${due.length} en Mantenimientos` : "Ver Mantenimientos"}
          </Link>
        </>
      )}
    </HomePanel>
  );
}
