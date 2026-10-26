import { formatDateTime } from "@/lib/utils/format";

import { getServiceHistory } from "../queries";
import type { FieldChange, HistoryChange } from "../types";

function Changes({ changes }: { changes: FieldChange[] }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {changes.map((change) => (
        <li key={change.field}>
          <span className="text-muted-foreground">{change.field}:</span>{" "}
          <del className="text-muted-foreground decoration-1">{change.before}</del>{" "}
          <span aria-hidden="true">→</span>
          <span className="sr-only">cambió a</span> <ins className="font-medium no-underline">{change.after}</ins>
        </li>
      ))}
    </ul>
  );
}

function ChangeLine({ change }: { change: HistoryChange }) {
  switch (change.kind) {
    case "service-created":
      return <p>Capturó el servicio.</p>;
    case "service-deleted":
      return <p>Eliminó el servicio.</p>;
    case "service-restored":
      return <p>Restauró el servicio con sus gastos y comprobantes.</p>;
    case "service-updated":
      return (
        <div>
          <p>Cambió los datos del servicio.</p>
          <Changes changes={change.changes} />
        </div>
      );
    case "expense-added":
      return <p>Agregó el gasto <span className="font-medium">{change.summary}</span>.</p>;
    case "expense-removed":
      return <p>Quitó el gasto <span className="font-medium">{change.summary}</span>.</p>;
    case "receipt-added":
      return <p>Agregó el comprobante <span className="font-medium break-all">{change.fileName}</span>.</p>;
    case "receipt-removed":
      return <p>Quitó el comprobante <span className="font-medium break-all">{change.fileName}</span>.</p>;
    case "expense-updated":
      return (
        <div>
          <p>Cambió el gasto <span className="font-medium">{change.summary}</span>.</p>
          <Changes changes={change.changes} />
        </div>
      );
  }
}

/**
 * Línea de cambios (D1): quién, cuándo, por qué y qué valores cambiaron.
 * El alta inicial se resume en un solo renglón.
 */
export async function ChangeHistory({ serviceId, className = "mt-10" }: { serviceId: string; className?: string }) {
  const entries = await getServiceHistory(serviceId);
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="historial" className={className}>
      <h2 id="historial" className="mb-4 text-2xl font-semibold">Línea de cambios</h2>
      <ol className="relative space-y-6 border-l-2 border-border pl-6">
        {entries.map((entry, index) => {
          const isCreation = entry.changes[0]?.kind === "service-created";
          return (
            <li key={`${entry.at}-${index}`} className="relative">
              <span
                aria-hidden="true"
                className={`absolute top-1.5 -left-[1.95rem] size-3.5 rounded-full border-2 border-white ${isCreation ? "bg-brand-cyan" : "bg-amber-500"}`}
              />
              <p className="text-sm text-muted-foreground tabular-nums">
                {formatDateTime(entry.at)} · <span className="font-medium text-foreground">{entry.author}</span>
              </p>
              {isCreation ? (
                <p>Capturó el servicio.</p>
              ) : (
                <>
                  {entry.reason && (
                    <p className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-amber-950">
                      <span className="font-medium">Motivo:</span> {entry.reason}
                    </p>
                  )}
                  <div className="mt-2 space-y-2">
                    {entry.changes.map((change, i) => (
                      <ChangeLine key={i} change={change} />
                    ))}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ChangeHistorySkeleton({ className = "mt-10" }: { className?: string }) {
  return <div className={`h-40 animate-pulse rounded-lg bg-muted ${className}`} aria-busy="true" aria-label="Cargando línea de cambios" />;
}
