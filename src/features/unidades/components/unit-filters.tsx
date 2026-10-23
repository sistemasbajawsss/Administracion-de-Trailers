"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import {
  UNIT_STATUS_LABELS,
  UNIT_STATUSES,
  UNIT_TYPE_LABELS,
  UNIT_TYPES_BY_GROUP,
  type UnitGroup,
} from "../types";

const ALL = "todos";

/**
 * Filtros en la URL. La búsqueda espera 300 ms después de la última tecla
 * para no consultar en cada letra.
 */
export function UnitFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const group = (searchParams.get("grupo") ?? "local") as UnitGroup;
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

  const types = UNIT_TYPES_BY_GROUP[group];
  const typeItems = { [ALL]: "Todos los tipos", ...Object.fromEntries(types.map((t) => [t, UNIT_TYPE_LABELS[t]])) };
  const statusItems = { [ALL]: "Todos los estatus", ...UNIT_STATUS_LABELS };
  const hasFilters = Boolean(
    searchParams.get("q") || searchParams.get("tipo") || searchParams.get("estatus") || searchParams.get("sinChofer"),
  );

  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative lg:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          inputMode="search"
          autoCapitalize="characters"
          placeholder="Buscar número económico"
          aria-label="Buscar por número económico"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-11 bg-white pl-10 text-base"
        />
        {isPending && (
          <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Cargando" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
        {types.length > 1 && (
          <Select
            items={typeItems}
            value={searchParams.get("tipo") ?? ALL}
            onValueChange={(value) => update({ tipo: value === ALL ? null : (value as string) })}
          >
            <SelectTrigger aria-label="Filtrar por tipo" className="h-11 w-full bg-white text-base sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(typeItems).map(([value, label]) => (
                <SelectItem key={value} value={value} className="min-h-10">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          items={statusItems}
          value={searchParams.get("estatus") ?? ALL}
          onValueChange={(value) => update({ estatus: value === ALL ? null : (value as string) })}
        >
          <SelectTrigger aria-label="Filtrar por estatus" className="h-11 w-full bg-white text-base sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[ALL, ...UNIT_STATUSES].map((value) => (
              <SelectItem key={value} value={value} className="min-h-10">
                {statusItems[value as keyof typeof statusItems]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-3 sm:col-span-1 sm:px-2">
          <Switch
            checked={searchParams.get("sinChofer") === "1"}
            onCheckedChange={(checked) => update({ sinChofer: checked ? "1" : null })}
          />
          <span className="text-base">Sin chofer</span>
        </label>
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="touch"
          className="self-start lg:ml-auto"
          onClick={() => {
            setSearch("");
            update({ q: null, tipo: null, estatus: null, sinChofer: null });
          }}
        >
          <X aria-hidden="true" />
          Quitar filtros
        </Button>
      )}
    </div>
  );
}
