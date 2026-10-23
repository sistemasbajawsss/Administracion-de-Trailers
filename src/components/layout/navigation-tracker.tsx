"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { IN_APP_HISTORY_KEY } from "@/components/shared/go-back";

/**
 * Anota cuando el usuario ya navegó dentro de la app, para que "Volver" use el
 * historial del navegador solo si la pantalla anterior es de la app.
 */
export function NavigationTracker() {
  const pathname = usePathname();
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (pathname === firstPath.current) return;
    try {
      window.sessionStorage.setItem(IN_APP_HISTORY_KEY, "1");
    } catch {
      // Sin sessionStorage (modo privado estricto): "Volver" usa la pantalla de respaldo.
    }
  }, [pathname]);

  return null;
}
