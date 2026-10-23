import { cn } from "cn";

import { UNIT_STATUS_LABELS, type UnitStatus } from "../types";

const STATUS_STYLES: Record<UnitStatus, string> = {
  activo: "border-brand-green/40 bg-brand-green/10 text-[#3d6b1c]",
  en_taller: "border-amber-500/40 bg-amber-50 text-amber-800",
  por_llegar: "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan",
  baja: "border-border bg-muted text-muted-foreground",
};

export function UnitStatusBadge({ status }: { status: UnitStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status],
      )}
    >
      {UNIT_STATUS_LABELS[status]}
    </span>
  );
}
