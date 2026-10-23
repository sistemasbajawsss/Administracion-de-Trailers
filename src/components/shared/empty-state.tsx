import type { ReactNode } from "react";

/**
 * Estado vacío: explica por qué no hay contenido y, si aplica, qué hacer.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-white px-6 py-12 text-center">
      <p className="font-heading text-xl font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
