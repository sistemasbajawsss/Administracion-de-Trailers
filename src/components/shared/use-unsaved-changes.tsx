"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

/**
 * Avisa antes de perder un formulario a medio llenar, con un diálogo de la app
 * (no el confirm del navegador):
 * - Al tocar un enlace de la app (menú, Inicio, Volver…) o un botón propio como
 *   Cancelar (`confirmLeave(() => goBack(...))`).
 * - "Salir y borrar" de verdad borra lo capturado: llama a `onDiscard` (el
 *   formulario se monta limpio al volver, ver useRemountAfterSave). Antes el
 *   aviso decía que no se guardaría, pero Next conservaba el formulario oculto y
 *   al volver seguía lleno (lo reportó el usuario el 2026-11-10).
 * - Al cerrar o recargar la pestaña solo existe el aviso del navegador: los
 *   navegadores no dejan mostrar uno propio ahí.
 * El gesto de "atrás" no se intercepta: chocaría con el historial del router.
 *
 * Uso: `const { confirmLeave, leaveDialog } = useUnsavedChanges(isDirty, onDiscard);`
 * y renderizar `{leaveDialog}` dentro del formulario.
 */
export function useUnsavedChanges(enabled: boolean, onDiscard?: () => void) {
  const router = useRouter();
  const [pending, setPending] = useState<(() => void) | null>(null);
  // Un clic que ya se confirmó: se deja pasar para que el enlace haga lo suyo
  // (navegar y, en celular, cerrar el menú).
  const bypass = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    // Fase de captura en document: corre antes que el onClick de <Link>, que no
    // navega si el evento ya viene con preventDefault.
    const onClick = (event: MouseEvent) => {
      if (bypass.current) {
        bypass.current = false;
        return;
      }
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(() => () => {
        if (anchor.isConnected) {
          bypass.current = true;
          anchor.click();
        } else {
          router.push(`${url.pathname}${url.search}${url.hash}`);
        }
      });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [enabled, router]);

  /** Para botones propios (Cancelar): pregunta solo si hay cambios. */
  const confirmLeave = useCallback(
    (proceed: () => void) => {
      if (!enabled) proceed();
      else setPending(() => proceed);
    },
    [enabled],
  );

  function leave() {
    const proceed = pending;
    setPending(null);
    // Sin el aviso del navegador: ya se confirmó aquí.
    onDiscard?.();
    proceed?.();
  }

  const leaveDialog: ReactNode = (
    <LeaveDialog open={pending !== null} onStay={() => setPending(null)} onLeave={leave} />
  );

  return { confirmLeave, leaveDialog };
}

function LeaveDialog({ open, onStay, onLeave }: { open: boolean; onStay: () => void; onLeave: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl">¿Salir sin guardar?</AlertDialogTitle>
          <AlertDialogDescription>
            Lo que capturaste en esta pantalla todavía no se ha guardado. Si sales, se borra.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="touch">Seguir capturando</AlertDialogCancel>
          <Button size="touch" variant="destructive" onClick={onLeave}>
            Salir y borrar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
