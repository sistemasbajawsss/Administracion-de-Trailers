"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

type TicketPing = { tipo?: string | null; prioridad?: string | null; creado_por?: string | null };

/**
 * Tickets al momento (5H, D16). La BD sube un contador sin datos
 * (`tickets_avisos`) cada vez que un ticket se crea o cambia; aquí se escucha
 * por Realtime y se
 * vuelve a pedir la pantalla al servidor (número del menú, Inicio y Tickets),
 * que revisa la sesión y los permisos. El navegador no tiene el token de la
 * sesión (cookie httpOnly) y no lo necesita. A quien atiende tickets (capturista
 * y admin) le avisa cuando llega uno nuevo. Varios avisos seguidos se juntan.
 */
export function TicketsLive({ notifyNew, userId }: { notifyNew: boolean; userId: string }) {
  const router = useRouter();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refreshSoon = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase
      .channel("tickets-taller")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets_avisos" }, (payload) => {
        const ping = (payload.new ?? {}) as TicketPing;
        // El que lo levantó no necesita el aviso de su propio ticket.
        if (notifyNew && ping.tipo === "insert" && ping.creado_por !== userId) {
          toast(ping.prioridad === "urgente" ? "Llegó un ticket de taller urgente" : "Llegó un ticket de taller", {
            action: { label: "Ver", onClick: () => router.push("/tickets") },
          });
        }
        refreshSoon();
      })
      .subscribe();

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, notifyNew, userId]);

  return null;
}
