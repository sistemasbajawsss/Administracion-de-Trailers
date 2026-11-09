import Link from "next/link";

import { cn } from "@/lib/utils";

import { MAINTENANCE_VIEWS, type MaintenanceView } from "../types";

const VIEW_LABELS: Record<MaintenanceView, string> = {
  correctivos: "Correctivos",
  preventivos: "Preventivos",
};

/**
 * Pestañas Correctivos / Preventivos como enlaces (el botón "atrás" funciona y
 * cambiar de pestaña limpia el filtro de estado).
 */
export function MaintenanceTabs({ current }: { current: MaintenanceView }) {
  return (
    <nav aria-label="Vistas de mantenimientos" className="mb-6 border-b">
      <ul className="-mb-px grid grid-cols-2 gap-1 sm:flex">
        {MAINTENANCE_VIEWS.map((view) => {
          const active = view === current;
          return (
            <li key={view} className="min-w-0">
              <Link
                href={view === "correctivos" ? "/mantenimientos" : `/mantenimientos?vista=${view}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center border-b-2 px-1 text-sm font-medium transition-colors outline-none sm:justify-start sm:px-4 sm:text-base",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "border-brand-cyan text-brand-ink" : "border-transparent text-muted-foreground hover:text-brand-ink",
                )}
              >
                {VIEW_LABELS[view]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
