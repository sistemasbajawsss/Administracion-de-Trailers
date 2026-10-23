"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

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

/**
 * Confirmación de acciones que no se pueden deshacer: muestra qué se va a
 * borrar y solo habilita el botón al escribir la frase exacta (como GitHub).
 */
export function TypedConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  rows,
  phrase,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Resumen de lo que se borra: [etiqueta, valor]. */
  rows: [string, string][];
  phrase: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: (typed: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed === phrase;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
        if (!next) setTyped("");
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-2xl">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="divide-y rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-2">
          <label htmlFor="confirmar-frase" className="text-sm">
            Para confirmar, escribe{" "}
            <strong className="rounded bg-muted px-1.5 py-0.5 font-semibold tracking-wide select-all">{phrase}</strong>
          </label>
          <Input
            id="confirmar-frase"
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
          <AlertDialogCancel size="touch" disabled={pending}>
            Cancelar
          </AlertDialogCancel>
          <Button variant="destructive" size="touch" onClick={() => onConfirm(typed)} disabled={!confirmed || pending}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {pending ? "Eliminando…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
