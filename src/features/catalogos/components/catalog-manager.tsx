"use client";

import { Merge, Pencil, Phone, Plus } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { cn } from "cn";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { setCatalogItemActive } from "../actions";
import { CATALOG_LABELS, isMergeableKind, type CatalogItem, type CatalogKind } from "../types";

import { CatalogItemDialog } from "./catalog-item-dialog";
import { MergeCatalogDialog } from "./merge-catalog-dialog";

/**
 * Lista de un catálogo con alta, edición y activar / desactivar.
 * El interruptor cambia al instante (useOptimistic) y se revierte si falla.
 */
export function CatalogManager({ kind, items }: { kind: CatalogKind; items: CatalogItem[] }) {
  const labels = CATALOG_LABELS[kind];
  const [dialog, setDialog] = useState<{ open: boolean; item?: CatalogItem }>({ open: false });
  // Proveedores y talleres (5I): el repetido que se va a unir con otro.
  const [merging, setMerging] = useState<CatalogItem | null>(null);
  const [, startTransition] = useTransition();

  const [optimisticItems, setOptimisticActive] = useOptimistic(
    items,
    (current, change: { id: string; active: boolean }) =>
      current.map((item) => (item.id === change.id ? { ...item, active: change.active } : item)),
  );

  // Activos primero; dentro de cada bloque, por nombre (ya viene ordenado).
  const sorted = [...optimisticItems].sort((a, b) => Number(b.active) - Number(a.active));
  const activeCount = optimisticItems.filter((item) => item.active).length;

  function toggle(item: CatalogItem, active: boolean) {
    startTransition(async () => {
      setOptimisticActive({ id: item.id, active });
      try {
        const result = await setCatalogItemActive(kind, item.id, active);
        if (!result.ok) toast.error(result.error);
        else toast.success(`Se ${active ? "activó" : "desactivó"} ${item.name}`);
      } catch {
        // Sin esto, sin internet la pantalla caía en la página de error (auditoría 2026-11-10).
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  const addLabel = kind === "categorias" ? "Nueva categoría" : `Nuevo ${labels.singular}`;

  return (
    <section aria-label={labels.title}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-muted-foreground">
          {activeCount} {activeCount === 1 ? "activo" : "activos"}
          {optimisticItems.length > activeCount && ` · ${optimisticItems.length - activeCount} inactivos`}
        </p>
        <Button size="touch" onClick={() => setDialog({ open: true })}>
          <Plus aria-hidden="true" />
          {addLabel}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title={`Sin ${labels.title.toLowerCase()} todavía`} description={labels.empty} />
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-white">
          {sorted.map((item) => (
            <li key={item.id} className="flex min-h-16 items-center gap-3 px-4 py-2 sm:px-5">
              <div className={cn("min-w-0 flex-1", !item.active && "opacity-55")}>
                <p className="text-base font-medium">
                  {item.name}
                  {!item.active && <span className="ml-2 text-sm font-normal text-muted-foreground">Inactivo</span>}
                </p>
                {(item.phone || item.notes) && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {item.phone && (
                      <>
                        <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{item.phone}</span>
                      </>
                    )}
                    {item.phone && item.notes && <span aria-hidden="true">—</span>}
                    {item.notes && <span className="min-w-0" title={item.notes}>{item.notes}</span>}
                  </p>
                )}
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1">
                <span className="sr-only">
                  {item.active ? `Desactivar ${item.name}` : `Activar ${item.name}`}
                </span>
                <Switch checked={item.active} onCheckedChange={(checked) => toggle(item, checked)} />
              </label>
              {isMergeableKind(kind) && (
                <Button
                  variant="ghost"
                  size="icon-touch"
                  aria-label={`Unir ${item.name} con otro ${labels.singular}`}
                  title="Unir con otro (repetido)"
                  onClick={() => setMerging(item)}
                >
                  <Merge />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-touch"
                aria-label={`Editar ${item.name}`}
                onClick={() => setDialog({ open: true, item })}
              >
                <Pencil />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CatalogItemDialog
        kind={kind}
        item={dialog.item}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
      {isMergeableKind(kind) && (
        <MergeCatalogDialog
          key={merging?.id ?? "cerrado"}
          kind={kind}
          item={merging}
          candidates={items.filter((candidate) => candidate.active)}
          onOpenChange={(open) => !open && setMerging(null)}
        />
      )}
    </section>
  );
}
