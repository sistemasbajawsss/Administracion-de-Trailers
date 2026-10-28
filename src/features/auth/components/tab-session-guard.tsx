"use client";

import { useEffect } from "react";

import { signOut } from "@/features/auth/actions";

/** Marca de la pestaña donde se inició sesión (sessionStorage se borra al cerrar la pestaña). */
const TAB_SESSION_KEY = "sesion-pestana";

/** Se llama al iniciar sesión: esta pestaña queda autorizada. */
export function markTabSession() {
  try {
    window.sessionStorage.setItem(TAB_SESSION_KEY, "1");
  } catch {
    // Sin sessionStorage (modo privado estricto): la sesión dura hasta cerrar el navegador.
  }
}

/**
 * La sesión termina al cerrar la pestaña: si esta pestaña no tiene la marca
 * (se cerró y se volvió a abrir, o es una pestaña nueva), cierra la sesión y
 * manda a /login. Recargar la página conserva la marca.
 */
export function TabSessionGuard() {
  useEffect(() => {
    let marked: string | null;
    try {
      marked = window.sessionStorage.getItem(TAB_SESSION_KEY);
    } catch {
      return; // Sin sessionStorage no se puede saber; no cerrar en cada carga.
    }
    if (marked) return;

    void signOut()
      .catch(() => undefined)
      .finally(() => window.location.replace("/login"));
  }, []);

  return null;
}
