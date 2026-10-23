"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Filtros en la URL: número económico (espera 300 ms tras la última tecla)
 * y rango de fechas.
 */
export function ServiceFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  function update(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("pagina");
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (search.trim() === current) return;
    const timeout = setTimeout(() => update({ q: search.trim() || null }), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona a lo que se escribe
  }, [search]);

  const hasFilters = Boolean(searchParams.get("q") || searchParams.get("desde") || searchParams.get("hasta"));
  const dateClass = "h-11 bg-white text-base";

  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="relative lg:w-60">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          inputMode="search"
          autoCapitalize="characters"
          placeholder="Unidad: T-17, R-39…"
          aria-label="Buscar por número económico"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-11 bg-white pl-10 text-base"
        />
        {isPending && (
          <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Cargando" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:flex">
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Desde
          <Input
            type="date"
            value={searchParams.get("desde") ?? ""}
            max={searchParams.get("hasta") ?? undefined}
            onChange={(event) => update({ desde: event.target.value || null })}
            className={dateClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Hasta
          <Input
            type="date"
            value={searchParams.get("hasta") ?? ""}
            min={searchParams.get("desde") ?? undefined}
            onChange={(event) => update({ hasta: event.target.value || null })}
            className={dateClass}
          />
        </label>
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="touch"
          className="self-start lg:ml-auto"
          onClick={() => {
            setSearch("");
            update({ q: null, desde: null, hasta: null });
          }}
        >
          <X aria-hidden="true" />
          Quitar filtros
        </Button>
      )}
    </div>
  );
}
