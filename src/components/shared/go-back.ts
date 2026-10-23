"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** Marca (por pestaña) de que ya hubo al menos una navegación dentro de la app. */
export const IN_APP_HISTORY_KEY = "app:hay-historial";

export function hasInAppHistory() {
  try {
    return window.sessionStorage.getItem(IN_APP_HISTORY_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Regresa a la pantalla anterior, como la flecha del navegador. Si la página
 * se abrió directo (enlace o pestaña nueva), va a `fallback` sin salir de la app.
 * `refresh` vuelve a pedir los datos de la pantalla a la que se regresa
 * (después de guardar o eliminar).
 */
export function useGoBack() {
  const router = useRouter();

  return useCallback(
    (fallback: string, options?: { refresh?: boolean }) => {
      if (hasInAppHistory()) {
        if (options?.refresh) {
          // history.back() es asíncrono: refrescar hasta llegar a la pantalla anterior.
          window.addEventListener("popstate", () => setTimeout(() => router.refresh(), 0), { once: true });
        }
        router.back();
      } else {
        router.replace(fallback);
      }
    },
    [router],
  );
}
