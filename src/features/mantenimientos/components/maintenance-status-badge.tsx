import { cn } from "@/lib/utils";

import { MAINTENANCE_STATUS_LABELS, type MaintenanceStatus } from "../types";

/** Colores de cada estado (también los usa el resumen de la página Mantenimientos). */
export const MAINTENANCE_STATUS_STYLES: Record<MaintenanceStatus, string> = {
  vencido: "border-red-500/40 bg-red-50 text-red-800",
  por_vencer: "border-amber-500/40 bg-amber-50 text-amber-800",
  al_corriente: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  sin_kilometraje: "border-border bg-muted text-muted-foreground",
};

/**
 * Vencido / Por vencer / Al corriente / Sin kilometraje (rojo, ámbar, verde, gris).
 * Público a propósito: también lo usa el formulario de servicio (5F).
 */
export function MaintenanceStatusBadge({ status, className }: { status: MaintenanceStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        MAINTENANCE_STATUS_STYLES[status],
        className,
      )}
    >
      {MAINTENANCE_STATUS_LABELS[status]}
    </span>
  );
}
