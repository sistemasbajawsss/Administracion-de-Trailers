"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { TypedConfirmationDialog } from "@/components/shared/typed-confirmation-dialog";
import { Button } from "@/components/ui/button";

import { purgeService } from "../actions";
import { PURGE_SERVICE_PHRASE } from "../schemas";

/** Eliminar para siempre un servicio que ya está en Eliminados (solo admin). */
export function PurgeServiceButton({
  historyId,
  unitEconomicNumber,
  dateLabel,
  expenseCount,
  totalLabel,
}: {
  historyId: number;
  unitEconomicNumber: string;
  dateLabel: string;
  expenseCount: number;
  totalLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function purge(typed: string) {
    startTransition(async () => {
      try {
        const result = await purgeService(historyId, { confirmation: typed });
        if (!result.ok) return void toast.error(result.error);
        toast.success(`El servicio de ${unitEconomicNumber} se eliminó para siempre`);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="touch"
        onClick={() => setOpen(true)}
        className="border-destructive/50 text-destructive hover:bg-destructive hover:text-white"
      >
        <Trash2 aria-hidden="true" />
        Eliminar para siempre
      </Button>
      <TypedConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title={`¿Eliminar para siempre el servicio de ${unitEconomicNumber}?`}
        description="Se borran la copia y toda su línea de cambios. Ya no se podrá restaurar. Solo quedará en la bitácora quién lo eliminó y cuándo."
        rows={[
          ["Fecha del servicio", dateLabel],
          ["Gastos", String(expenseCount)],
          ["Total", totalLabel],
        ]}
        phrase={PURGE_SERVICE_PHRASE}
        confirmLabel="Eliminar para siempre"
        pending={isPending}
        onConfirm={purge}
      />
    </>
  );
}
