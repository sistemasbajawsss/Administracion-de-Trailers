"use client";

import { LoaderCircle } from "lucide-react";

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
import type { EditConflict } from "@/lib/action-result";
import { formatDateTime } from "@/lib/utils/format";

/**
 * Ediciones simultáneas (5I): otra persona guardó el registro mientras se
 * editaba. Lo de esta pantalla no se guardó (para no borrar lo de la otra
 * persona). "Cargar lo que guardó" trae la versión nueva y borra lo escrito
 * aquí, y lo dice; "Quedarme aquí" deja copiar lo escrito antes de cargar.
 */
export function EditConflictDialog({
  conflict,
  subject,
  reloading,
  onReload,
  onClose,
}: {
  conflict: EditConflict | null;
  /** Inicio del título: "Este servicio", "Esta unidad". */
  subject: string;
  reloading: boolean;
  onReload: () => void;
  onClose: () => void;
}) {
  const [date, time] = conflict ? formatDateTime(conflict.at).split(" ") : ["", ""];
  const who = conflict?.by ?? "Otra persona";

  return (
    <AlertDialog open={conflict !== null} onOpenChange={(open) => !open && !reloading && onClose()}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl">{subject} cambió mientras editabas</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              <strong className="font-semibold text-foreground">{who}</strong> guardó cambios el {date} a las {time} mientras
              tú editabas. Lo tuyo no se guardó, para no borrar lo suyo.
            </span>
            <span className="block">
              Para guardar lo tuyo, carga lo que se guardó y vuelve a hacer tus cambios. Al cargar se borra lo que
              escribiste en esta pantalla; si quieres conservar algo, cópialo antes.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="touch" disabled={reloading}>
            Quedarme aquí
          </AlertDialogCancel>
          <Button size="touch" onClick={onReload} disabled={reloading}>
            {reloading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {reloading ? "Cargando…" : "Cargar lo que se guardó"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
