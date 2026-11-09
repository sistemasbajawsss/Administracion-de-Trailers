import { cn } from "@/lib/utils";

import { SERVICE_TYPE_LABELS, type ServiceType } from "../types";

/**
 * Etiqueta del tipo de servicio (5F). El correctivo, que es el que se programa,
 * lleva el color de la marca; los otros dos van neutros.
 */
const STYLES: Record<ServiceType, string> = {
  correctivo: "border-brand-ink bg-brand-ink text-white",
  preventivo: "border-brand-ink/30 bg-white text-brand-ink",
  servicio: "border-border bg-muted text-foreground",
};

export function ServiceTypeBadge({ type, className }: { type: ServiceType; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        STYLES[type],
        className,
      )}
    >
      {SERVICE_TYPE_LABELS[type]}
    </span>
  );
}
