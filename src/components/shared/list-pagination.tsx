import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";

/**
 * Paginación por URL: conserva los filtros actuales y solo cambia ?pagina=.
 */
export function ListPagination({
  page,
  total,
  pageSize,
  pathname,
  params,
}: {
  page: number;
  total: number;
  pageSize: number;
  pathname: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("pagina", String(target));
    else search.delete("pagina");
    const query = search.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const linkClass = buttonVariants({ variant: "outline", size: "touch" });

  return (
    <nav aria-label="Paginación" className="mt-6 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={linkClass}>
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground">
        Página {page} de {pages}
      </p>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={cn(linkClass)}>
          Siguiente
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
