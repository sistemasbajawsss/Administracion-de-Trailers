import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

/** Tarjeta de Inicio: título con su número a la derecha y el contenido debajo. */
export function HomePanel({
  title,
  count,
  description,
  children,
}: {
  title: string;
  count?: number;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">{title}</h2>
        {count !== undefined && (
          <span className={`font-heading text-3xl font-bold tabular-nums ${count > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
            {count}
          </span>
        )}
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function HomePanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 py-6 text-muted-foreground">
      <CircleCheck className="size-5 text-brand-green" aria-hidden="true" />
      {children}
    </p>
  );
}
