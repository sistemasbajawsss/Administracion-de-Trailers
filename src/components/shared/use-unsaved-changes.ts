"use client";

import { useCallback, useEffect } from "react";

export const UNSAVED_CHANGES_MESSAGE = "Tienes cambios sin guardar. ¿Salir sin guardarlos?";

/**
 * Avisa antes de perder un formulario a medio llenar: al cerrar o recargar la
 * pestaña (aviso del navegador) y al tocar un enlace de la app (menú, Inicio…).
 * El gesto de "atrás" no se intercepta: chocaría con el historial del router;
 * Next conserva el formulario oculto y al volver sigue lleno.
 * Regresa `confirmLeave` para botones propios como Cancelar.
 */
export function useUnsavedChanges(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    // Fase de captura en document: corre antes que el onClick de <Link>, que no
    // navega si el evento ya viene con preventDefault.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [enabled]);

  return useCallback(() => !enabled || window.confirm(UNSAVED_CHANGES_MESSAGE), [enabled]);
}
