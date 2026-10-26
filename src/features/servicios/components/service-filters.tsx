"use client";

import { LoaderCircle, Search, Tag, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Campo de texto que actualiza la URL 300 ms después de la última tecla. */
function useDebouncedParam(name: string, update: (changes: Record<string, string | null>) => void) {
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(name) ?? "");

  useEffect(() => {
    const current = searchParams.get(name) ?? "";
    if (value.trim() === current) return;
    const timeout = setTimeout(() => update({ [name]: value.trim() || null }), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona a lo que se escribe
  }, [value]);

  return [value, setValue] as const;
}

/**
 * Filtros de la lista de gastos, en la URL: categoría o concepto, rango de
 * fechas y, en la pantalla Servicios, número económico.
 */
export function ServiceFilters({ unitSearch = true }: { unitSearch?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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

  const [unit, setUnit] = useDebouncedParam("q", update);
  const [category, setCategory] = useDebouncedParam("buscar", update);

  const hasFilters = ["q", "buscar", "desde", "hasta"].some((key) => searchParams.get(key));
  const dateClass = "h-11 bg-white text-base";
  const iconClass = "pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground";

  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="grid gap-3 sm:grid-cols-2 lg:flex">
        {unitSearch && (
          <div className="relative lg:w-48">
            <Search className={iconClass} aria-hidden="true" />
            <Input
              type="search"
              inputMode="search"
              autoCapitalize="characters"
              placeholder="Unidad: T-17…"
              aria-label="Buscar por número económico"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              className="h-11 bg-white pl-10 text-base"
            />
          </div>
        )}
        <div className="relative lg:w-64">
          <Tag className={iconClass} aria-hidden="true" />
          <Input
            type="search"
            inputMode="search"
            placeholder="Categoría o concepto: frenos…"
            aria-label="Buscar por categoría o concepto"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 bg-white pl-10 text-base"
          />
          {isPending && (
            <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Cargando" />
          )}
        </div>
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
            setUnit("");
            setCategory("");
            update({ q: null, buscar: null, desde: null, hasta: null });
          }}
        >
          <X aria-hidden="true" />
          Quitar filtros
        </Button>
      )}
    </div>
  );
}
