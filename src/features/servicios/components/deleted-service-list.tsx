import { EmptyState } from "@/components/shared/empty-state";
import { formatCents, formatDate, formatDateTime } from "@/lib/utils/format";

import { listDeletedServices } from "../queries";

import { PurgeServiceButton } from "./purge-service-button";
import { RestoreServiceDialog } from "./restore-service-dialog";

/** Servicios eliminados que se pueden restaurar, del más reciente al más antiguo. */
export async function DeletedServiceList() {
  const services = await listDeletedServices();

  if (services.length === 0) {
    return (
      <EmptyState
        title="No hay servicios eliminados"
        description="Cuando se elimine un servicio, aparecerá aquí para poder restaurarlo."
      />
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-white">
      {services.map((service) => {
        const unit = service.unitEconomicNumber ?? "Unidad";
        return (
          <li key={service.historyId} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span className="w-16 shrink-0 font-heading text-xl font-bold tracking-wide text-muted-foreground line-through decoration-1 tabular-nums">
                {unit}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base">
                  Servicio del {formatDate(service.date)} ·{" "}
                  <span className="font-semibold tabular-nums">{formatCents(service.totalCents)}</span> ·{" "}
                  {service.expenseCount} {service.expenseCount === 1 ? "gasto" : "gastos"}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  Lo eliminó {service.deletedBy} el {formatDateTime(service.deletedAt)}
                </p>
                {service.reason && (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Motivo:</span> {service.reason}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <RestoreServiceDialog
                historyId={service.historyId}
                label={`el servicio de ${unit} del ${formatDate(service.date)}`}
              />
              <PurgeServiceButton
                historyId={service.historyId}
                unitEconomicNumber={unit}
                dateLabel={formatDate(service.date)}
                expenseCount={service.expenseCount}
                totalLabel={formatCents(service.totalCents)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
