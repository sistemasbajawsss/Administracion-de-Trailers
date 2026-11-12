"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { TicketCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";

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
          const urgent = ping.prioridad === "urgente";
          // Grande y hasta que lo cierren (el usuario dijo que el aviso chico no se alcanzaba a ver).
          // Si llega otro, reemplaza al anterior (mismo id). En Android, además, vibra.
          toast.custom(
            (id) => (
              <NewTicketAlert
                urgent={urgent}
                onView={() => {
                  toast.dismiss(id);
                  router.push("/tickets");
                }}
                onClose={() => toast.dismiss(id)}
              />
            ),
            { id: "ticket-nuevo", duration: Infinity },
          );
          try {
            navigator.vibrate?.(urgent ? [300, 150, 300, 150, 300] : [300, 150, 300]);
          } catch {
            // Sin vibración (iPhone, computadora): solo el aviso.
          }
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

/** Aviso de ticket nuevo: ancho, letra grande y botones de 48 px; rojo si es urgente. */
function NewTicketAlert({ urgent, onView, onClose }: { urgent: boolean; onView: () => void; onClose: () => void }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex w-[min(92vw,28rem)] min-w-0 items-start gap-3 rounded-2xl border-2 p-4 shadow-xl",
        urgent ? "border-red-700 bg-red-700 text-white" : "border-amber-500 bg-amber-50 text-amber-950",
      )}
    >
      <TicketCheck className={cn("mt-0.5 size-8 shrink-0", urgent ? "text-white" : "text-amber-700")} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-snug font-bold">{urgent ? "Llegó un ticket de taller URGENTE" : "Llegó un ticket de taller"}</p>
        <p className={cn("mt-0.5 text-base", urgent ? "text-white/90" : "text-amber-900")}>
          Ábrelo para aceptarlo o rechazarlo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onView}
            className={cn(
              "inline-flex min-h-12 items-center rounded-lg px-5 text-base font-semibold outline-none focus-visible:ring-3",
              urgent ? "bg-white text-red-800 focus-visible:ring-white/60" : "bg-amber-700 text-white focus-visible:ring-amber-700/40",
            )}
          >
            Ver tickets
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex min-h-12 items-center rounded-lg px-4 text-base font-medium outline-none focus-visible:ring-3",
              urgent ? "text-white underline-offset-2 hover:underline focus-visible:ring-white/60" : "text-amber-950 hover:underline focus-visible:ring-amber-700/40",
            )}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
