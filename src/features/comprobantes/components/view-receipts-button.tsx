"use client";

import { FileSearch } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { ReceiptViewer } from "./receipt-viewer";

/** "Ver factura" de un renglón: abre el visor del servicio en un modal. */
export function ViewReceiptsButton({
  serviceId,
  title,
  count,
}: {
  serviceId: string;
  /** "T-17 · 12/10/2026". */
  title: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);

  if (count === 0) {
    return <span className="inline-flex h-11 items-center text-sm text-muted-foreground">Sin factura</span>;
  }

  return (
    <>
      <Button type="button" variant="outline" size="touch" onClick={() => setOpen(true)} className="h-11 px-3">
        <FileSearch aria-hidden="true" />
        Ver factura
        {count > 1 && <span className="text-muted-foreground tabular-nums">({count})</span>}
      </Button>
      {open && <ReceiptViewer open onOpenChange={setOpen} serviceId={serviceId} title={title} />}
    </>
  );
}
