"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { CATALOG_LABELS } from "../types";

import { CatalogItemDialog } from "./catalog-item-dialog";

/**
 * Alta rápida de proveedor (o de taller, 5G) para quien captura, pensada para el
 * formulario de servicio: al guardar, devuelve el nuevo para seleccionarlo.
 */
export function SupplierQuickAdd({
  onCreated,
  kind = "proveedores",
}: {
  onCreated: (item: { id: string; name: string }) => void;
  kind?: "proveedores" | "talleres";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="touch" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Nuevo {CATALOG_LABELS[kind].singular}
      </Button>
      <CatalogItemDialog kind={kind} open={open} onOpenChange={setOpen} onSaved={onCreated} />
    </>
  );
}
