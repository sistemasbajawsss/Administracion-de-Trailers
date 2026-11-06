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
 * (después de guardar o eliminar). `gone`: ruta de algo que ya no existe (un
 * servicio eliminado); si "atrás" cae en ella o en sus subpantallas (su detalle,
 * su Editar), se va a `fallback` en lugar de mostrar "no encontrado".
 */
export function useGoBack() {
  const router = useRouter();

  return useCallback(
    (fallback: string, options?: { refresh?: boolean; gone?: string }) => {
      if (hasInAppHistory()) {
        if (options?.refresh || options?.gone) {
          // history.back() es asíncrono: se revisa al llegar a la pantalla anterior.
          window.addEventListener(
            "popstate",
            () =>
              setTimeout(() => {
                const path = window.location.pathname;
                const gone = options.gone;
                if (gone && (path === gone || path.startsWith(`${gone}/`))) router.replace(fallback);
                else if (options.refresh) router.refresh();
              }, 0),
            { once: true },
          );
        }
        router.back();
      } else {
        router.replace(fallback);
      }
    },
    [router],
  );
}
