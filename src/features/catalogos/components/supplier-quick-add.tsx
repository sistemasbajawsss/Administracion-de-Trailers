"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { CatalogItemDialog } from "./catalog-item-dialog";

/**
 * Alta rápida de proveedor para ambos roles, pensada para el formulario de
 * captura (Sección 2): al guardar, devuelve el nuevo proveedor para seleccionarlo.
 */
export function SupplierQuickAdd({
  onCreated,
}: {
  onCreated: (supplier: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="touch" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Nuevo proveedor
      </Button>
      <CatalogItemDialog kind="proveedores" open={open} onOpenChange={setOpen} onSaved={onCreated} />
    </>
  );
}
