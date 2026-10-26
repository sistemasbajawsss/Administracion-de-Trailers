import { ChevronRight, FileText } from "lucide-react";
import Link from "next/link";

import { UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { formatDate, formatMoney } from "@/lib/utils/format";

import type { ServiceBrief } from "../types";

/**
 * Lista corta de servicios para Inicio: fecha, unidad, quién lo capturó y total.
 * Cada renglón abre el servicio (ahí se sube la factura).
 */
export function ServiceBriefList({
  services,
  showAuthor = false,
  showReceipts = false,
}: {
  services: ServiceBrief[];
  showAuthor?: boolean;
  /** Marca "Sin factura" o cuántos comprobantes tiene. */
  showReceipts?: boolean;
}) {
  return (
    <ul className="divide-y">
      {services.map((service) => (
        <li key={service.id}>
          <Link
            href={`/servicios/${service.id}`}
            className="flex min-h-14 items-center gap-3 px-1 py-2 outline-none hover:bg-muted/50 focus-visible:bg-muted"
          >
            <span className="w-14 shrink-0 font-heading text-lg font-bold tracking-wide text-brand-ink tabular-nums">
              {service.economicNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm tabular-nums">{formatDate(service.date)}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {UNIT_TYPE_LABELS[service.unitType]}
                {showAuthor && service.author && ` · ${service.author}`}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums">{formatMoney(service.total)}</span>
              {showReceipts &&
                (service.receiptCount === 0 ? (
                  <span className="text-xs font-medium text-amber-800">Sin factura</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="size-3" aria-hidden="true" />
                    {service.receiptCount}
                  </span>
                ))}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
