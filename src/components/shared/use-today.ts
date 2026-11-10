"use client";

import { useSyncExternalStore } from "react";

import { todayInTijuana } from "@/lib/utils/format";

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
}

/**
 * "Hoy" en Tijuana que se mantiene al día en el cliente. El servidor manda su
 * "hoy" al pintar la pantalla, pero si se queda abierta pasada la medianoche ese
 * valor se hace viejo y el calendario no dejaba elegir la fecha de hoy hasta
 * recargar (auditoría 2026-11-10). Se revisa cada minuto, al volver a la pestaña
 * y al enfocar la ventana. Nunca regresa una fecha anterior a la del servidor
 * (por si el reloj del teléfono va atrasado); la BD sigue rechazando fechas futuras.
 */
export function useToday(serverToday: string) {
  const clientToday = useSyncExternalStore(subscribe, todayInTijuana, () => serverToday);
  return clientToday > serverToday ? clientToday : serverToday;
}
