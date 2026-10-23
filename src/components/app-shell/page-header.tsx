import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
      {description && (
        <p className="mt-2 max-w-prose text-muted-foreground">{description}</p>
      )}
    </header>
  );
}

/**
 * Estado vacío para pantallas cuyo contenido llega en una sección posterior.
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
