"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { TypedConfirmationDialog } from "@/components/shared/typed-confirmation-dialog";
import { Button } from "@/components/ui/button";

import { deleteUnit } from "../actions";
import { DELETE_UNIT_PHRASE } from "../schemas";

/**
 * Zona de peligro de la ficha (solo admin): elimina la unidad con todo su
 * historial. El botón final se habilita solo al escribir la frase exacta.
 */
export function DeleteUnitZone({
  unitId,
  economicNumber,
  serviceCount,
  expenseCount,
  totalLabel,
  afterDeleteHref,
}: {
  unitId: string;
  economicNumber: string;
  serviceCount: number;
  expenseCount: number;
  /** Total invertido ya formateado ("$45,320.00"). */
  totalLabel: string;
  afterDeleteHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove(typed: string) {
    startTransition(async () => {
      try {
        const result = await deleteUnit(unitId, { confirmation: typed });
        if (!result.ok) return void toast.error(result.error);
        toast.success(`${economicNumber} y todo su historial se eliminaron`);
        setOpen(false);
        // replace: "Volver" ya no puede regresar a la ficha de una unidad que no existe.
        router.replace(afterDeleteHref);
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <section aria-labelledby="zona-eliminar" className="mt-16 rounded-xl border border-destructive/40 bg-white">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="max-w-prose">
          <h2 id="zona-eliminar" className="text-xl font-semibold text-destructive">
            Eliminar registro completo
          </h2>
          <p className="mt-1 text-muted-foreground">
            Borra {economicNumber} con todos sus servicios, gastos y línea de cambios. No se puede deshacer.
            Si solo quieres que deje de aparecer, dala de baja en Editar unidad.
          </p>
        </div>
        <Button
          variant="outline"
          size="touch"
          onClick={() => setOpen(true)}
          className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-white"
        >
          <Trash2 aria-hidden="true" />
          Eliminar {economicNumber}
        </Button>
      </div>

      <TypedConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title={`¿Eliminar ${economicNumber} para siempre?`}
        description="Esta acción no se puede deshacer. Solo quedará en la bitácora quién la eliminó y cuándo."
        rows={[
          ["Servicios", String(serviceCount)],
          ["Gastos", String(expenseCount)],
          ["Total invertido registrado", totalLabel],
        ]}
        phrase={DELETE_UNIT_PHRASE}
        confirmLabel="Eliminar para siempre"
        pending={isPending}
        onConfirm={remove}
      />
    </section>
  );
}
