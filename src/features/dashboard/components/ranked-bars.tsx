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
  emptyText = "Sin gastos en este periodo.",
}: {
  items: RankedItem[];
  /** Total del periodo, para la parte de cada renglón. */
  grandTotal: string;
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="py-6 text-center text-muted-foreground">{emptyText}</p>;

  const grand = toCents(grandTotal) || 1;
  const max = Math.max(...items.map((item) => toCents(item.total) ?? 0), 1);

  return (
    <ol className="space-y-3">
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
