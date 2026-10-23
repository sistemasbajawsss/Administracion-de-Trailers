"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [typed, setTyped] = useState("");
  const [isPending, startTransition] = useTransition();
  const confirmed = typed === DELETE_UNIT_PHRASE;

  function remove() {
    if (!confirmed) return;
    startTransition(async () => {
      try {
        const result = await deleteUnit(unitId, { confirmation: typed });
        if (!result.ok) return void toast.error(result.error);
        toast.success(`${economicNumber} y todo su historial se eliminaron`);
        setOpen(false);
        router.push(afterDeleteHref);
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

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (isPending) return;
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-2xl">¿Eliminar {economicNumber} para siempre?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Solo quedará en la bitácora quién la eliminó y cuándo.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="divide-y rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
            {[
              ["Servicios", String(serviceCount)],
              ["Gastos", String(expenseCount)],
              ["Total invertido registrado", totalLabel],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-2">
            <label htmlFor="confirmar-eliminacion" className="text-sm">
              Para confirmar, escribe{" "}
              <strong className="rounded bg-muted px-1.5 py-0.5 font-semibold tracking-wide select-all">
                {DELETE_UNIT_PHRASE}
              </strong>
            </label>
            <Input
              id="confirmar-eliminacion"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={typed.length > 0 && !confirmed}
              className="h-12 text-base tracking-wide"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel size="touch" disabled={isPending}>
              Cancelar
            </AlertDialogCancel>
            <Button variant="destructive" size="touch" onClick={remove} disabled={!confirmed || isPending}>
              {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isPending ? "Eliminando…" : "Eliminar para siempre"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
