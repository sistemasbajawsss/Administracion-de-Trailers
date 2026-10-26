import Link from "next/link";

import { formatMoney, toCents } from "@/lib/utils/format";

export type RankedItem = {
  key: string;
  label: string;
  /** Texto secundario: "12 servicios", "Caja · Foráneos". */
  detail?: string;
  total: string;
  href?: string;
};

const percent = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });

/**
 * Lista ordenada con barra (una sola serie, un solo color). En HTML y no en una
 * gráfica: los nombres largos nunca se cortan y el monto y su parte del total
 * siempre se leen como texto, también en el celular.
 */
export function RankedBars({
  items,
  grandTotal,
  limit,
  columns = 1,
  emptyText = "Sin gastos en este periodo.",
}: {
  items: RankedItem[];
  /** Total del periodo, para la parte de cada renglón. */
  grandTotal: string;
  /** Renglones visibles; el resto queda en "Ver los otros N". */
  limit?: number;
  /** En pantallas anchas, dos columnas (para listas cortas a todo lo ancho). */
  columns?: 1 | 2;
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="py-6 text-center text-muted-foreground">{emptyText}</p>;

  const grand = toCents(grandTotal) || 1;
  // La barra más larga es la del primero de toda la lista, también en los ocultos.
  const max = Math.max(...items.map((item) => toCents(item.total) ?? 0), 1);
  const visible = limit ? items.slice(0, limit) : items;
  const hidden = limit ? items.slice(limit) : [];
  const listClass = columns === 2 ? "grid gap-x-10 gap-y-3 lg:grid-cols-2" : "space-y-3";

  return (
    <>
      <Rows items={visible} grand={grand} max={max} className={listClass} />
      {hidden.length > 0 && (
        <details className="group mt-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">Ver {hidden.length === 1 ? "la otra" : `las otras ${hidden.length}`}</span>
            <span className="hidden group-open:inline">Ver menos</span>
          </summary>
          <Rows items={hidden} grand={grand} max={max} className={`${listClass} mt-2`} start={visible.length + 1} />
        </details>
      )}
    </>
  );
}

function Rows({
  items,
  grand,
  max,
  className,
  start = 1,
}: {
  items: RankedItem[];
  grand: number;
  max: number;
  className: string;
  start?: number;
}) {
  return (
    <ol className={className} start={start}>
      {items.map((item) => {
        const cents = toCents(item.total) ?? 0;
        const label = item.href ? (
          <Link href={item.href} className="font-medium underline-offset-2 hover:underline focus-visible:underline">
            {item.label}
          </Link>
        ) : (
          <span className="font-medium">{item.label}</span>
        );
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                {label}
                {item.detail && <span className="text-sm text-muted-foreground"> · {item.detail}</span>}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="font-semibold">{formatMoney(item.total)}</span>
                <span className="ml-2 inline-block w-12 text-sm text-muted-foreground">{percent.format(cents / grand)}</span>
              </span>
            </div>
            {/* Barra de 8 px, extremo redondeado y base recta; el riel es un paso más claro. */}
            <div className="mt-1.5 h-2 rounded-r-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-r-full bg-brand-cyan" style={{ width: `${(cents / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
