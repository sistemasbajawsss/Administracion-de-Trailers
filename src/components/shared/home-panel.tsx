import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Tarjeta de Inicio: título con su número a la derecha, el contenido y, al pie,
 * "Ver los N" (footer). Ocupa todo el alto de su celda para que las tarjetas de
 * un mismo renglón midan lo mismo y sus botones queden alineados.
 */
export function HomePanel({
  title,
  count,
  description,
  footer,
  className = "",
  children,
}: {
  title: string;
  count?: number;
  description?: string;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex h-full min-w-0 flex-col rounded-xl border bg-white p-4 sm:p-5 ${className}`}>
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
      {footer && <div className="mt-auto pt-3">{footer}</div>}
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
