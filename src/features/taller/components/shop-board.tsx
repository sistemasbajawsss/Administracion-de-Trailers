import { ClipboardPlus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { UNIT_GROUP_LABELS, UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { formatDate } from "@/lib/utils/format";

import type { ShopEntry } from "../types";

import { ReleaseShopDialog } from "./release-shop-dialog";

/** Días completos entre dos fechas "aaaa-mm-dd" (sin zonas horarias). */
function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000));
}

/** Una semana o más en taller se marca en ámbar. */
const LONG_STAY_DAYS = 7;

function groupLabel(entry: ShopEntry) {
  if (entry.unitType === "camioneta") return UNIT_GROUP_LABELS.camionetas;
  return entry.unitOperation === "foraneo" ? UNIT_GROUP_LABELS.foraneo : UNIT_GROUP_LABELS.local;
}

/**
 * Unidades en taller, la que lleva más tiempo primero. Cada tarjeta: número
 * económico, días en taller, falla y quién la reportó. Admin y capturista tienen
 * "Registrar servicio" y "Dar salida"; el gerente solo ve.
 */
export function ShopBoard({
  entries,
  today,
  canCapture,
}: {
  entries: ShopEntry[];
  today: string;
  canCapture: boolean;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No hay unidades en taller"
        description={
          canCapture
            ? "Cuando una unidad llegue con una falla, registra su entrada para que aparezca aquí."
            : "Cuando una unidad entre a taller, aparecerá aquí con su falla y los días que lleva."
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Unidades en taller">
      {entries.map((entry) => {
        const days = daysBetween(entry.entryDate, today);
        const longStay = days >= LONG_STAY_DAYS;
        return (
          <li key={entry.id} className="flex min-w-0 flex-col rounded-xl border bg-white">
            <div className="flex items-start gap-4 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="font-heading text-4xl leading-none font-bold tracking-wide text-brand-ink tabular-nums">
                  {entry.economicNumber}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {UNIT_TYPE_LABELS[entry.unitType]} · {groupLabel(entry)}
                </p>
              </div>
              <div
                className={`shrink-0 rounded-lg px-3 py-2 text-center ${longStay ? "bg-amber-50 text-amber-800" : "bg-muted text-brand-ink"}`}
              >
                {days === 0 ? (
                  <p className="font-heading text-xl leading-tight font-bold">Hoy</p>
                ) : (
                  <p className="font-heading text-3xl leading-none font-bold tabular-nums">{days}</p>
                )}
                <p className="mt-0.5 text-xs whitespace-nowrap">{days === 0 ? "entró" : days === 1 ? "día" : "días"}</p>
              </div>
            </div>

            <div className="mx-4 border-l-4 border-amber-400 pl-3 sm:mx-5">
              <p className="text-xs font-medium text-muted-foreground">Falla</p>
              <p className="whitespace-pre-line">{entry.fault}</p>
            </div>

            <p className="mx-4 mt-3 mb-4 min-w-0 text-sm text-muted-foreground sm:mx-5 sm:mb-5">
              Entró el {formatDate(entry.entryDate)}
              {entry.reportedBy ? ` · Reportó ${entry.reportedBy}` : ""}
            </p>

            {canCapture && (
              <div className="mt-auto flex flex-col gap-2 border-t p-4 pt-4 sm:flex-row sm:p-5 sm:pt-4">
                <Link
                  href={`/servicios/nuevo?unidad=${entry.unitId}`}
                  className={buttonVariants({ size: "touch", className: "w-full sm:w-auto" })}
                >
                  <ClipboardPlus aria-hidden="true" />
                  Registrar servicio
                </Link>
                <ReleaseShopDialog
                  entryId={entry.id}
                  economicNumber={entry.economicNumber}
                  entryDate={entry.entryDate}
                  today={today}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
