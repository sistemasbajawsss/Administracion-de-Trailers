"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Abre el cuadro de impresión del navegador: ahí se elige la impresora o
 * "Guardar como PDF". La hoja sale sin menú ni filtros (estilos print: y @media print).
 */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="touch" onClick={() => window.print()}>
      <Printer aria-hidden="true" />
      Imprimir o guardar PDF
    </Button>
  );
}
