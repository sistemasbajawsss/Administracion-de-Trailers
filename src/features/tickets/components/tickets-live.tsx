"use client";

import { ShieldCheck, TicketCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { createClient } from "@/lib/supabase/client";

import { getLatestAdminApprovals } from "../actions";
import type { AdminApproval } from "../types";

type Totals = { created: number; urgent: number };
type Ping = { creados?: number; urgentes?: number; aprobados_admin?: number; tipo?: string | null; creado_por?: string | null };

const ALERT_ID = "ticket-nuevo";
const APPROVAL_ID = "ticket-aprobado";

/**
 * Tickets al momento (5H, D16). La BD sube un contador sin datos
 * (`tickets_avisos`) cada vez que un ticket se crea o cambia; aquí se escucha
 * por Realtime y se vuelve a pedir la pantalla al servidor (número del menú,
 * Inicio y Tickets), que revisa la sesión y los permisos. El navegador no tiene
 * el token de la sesión (cookie httpOnly) y no lo necesita.
 *
 * Aviso de tickets nuevos (capturista y admin): el contador trae el total de
 * tickets creados y de urgentes; se compara contra lo último que se vio, así
 * que dos tickets casi al mismo tiempo (o un aviso perdido por mala señal) se
 * cuentan todos. El aviso suma lo que va llegando ("Llegaron 3, 1 urgente"),
 * sigue rojo mientras haya un urgente sin ver y vuelve a cero al cerrarlo o al
 * tocar "Ver tickets" (pedido del usuario, 2026-11-12).
 *
 * Aprobaciones de admin (solo capturistas): el contador también suma las
 * aprobaciones; con la diferencia se piden al servidor (con sesión) quién aprobó
 * y qué unidad, y sale "Sistemas aprobó el ticket de T-17" hasta que lo cierren.
 */
export function TicketsLive({
  notifyNew,
  notifyApprovals,
  userId,
}: {
  notifyNew: boolean;
  notifyApprovals: boolean;
  userId: string;
}) {
  const router = useRouter();
  const timer = useRef<number | null>(null);
  /** Totales de la BD la última vez que se vieron. */
  const seen = useRef<Totals | null>(null);
  /** Tickets nuevos que el aviso está mostrando (sin cerrar). */
  const unseen = useRef<Totals>({ created: 0, urgent: 0 });
  /** Aprobaciones de admin: total visto y las que muestra el aviso. */
  const seenApprovals = useRef<number | null>(null);
  const approvals = useRef<AdminApproval[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const refreshSoon = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => router.refresh(), 400);
    };

    const clearAlert = () => {
      unseen.current = { created: 0, urgent: 0 };
      toast.dismiss(ALERT_ID);
    };

    const showAlert = () => {
      const { created, urgent } = unseen.current;
      toast.custom(
        () => (
          <NewTicketAlert
            created={created}
            urgent={urgent}
            onView={() => {
              clearAlert();
              router.push("/tickets");
            }}
            onClose={clearAlert}
          />
        ),
        { id: ALERT_ID, duration: Infinity, onDismiss: () => (unseen.current = { created: 0, urgent: 0 }) },
      );
      try {
        navigator.vibrate?.(urgent > 0 ? [300, 150, 300, 150, 300] : [300, 150, 300]);
      } catch {
        // Sin vibración (iPhone, computadora): solo el aviso.
      }
    };

    const clearApprovals = () => {
      approvals.current = [];
      toast.dismiss(APPROVAL_ID);
    };

    const showApprovals = async (count: number) => {
      try {
        const result = await getLatestAdminApprovals(Math.min(count, 10));
        if (!active || !result.ok || result.data.length === 0) return;
        const known = new Set(approvals.current.map((a) => a.id));
        approvals.current = [...result.data.filter((a) => !known.has(a.id)), ...approvals.current].slice(0, 10);
      } catch {
        return; // Sin conexión: la lista de Tickets ya se actualiza al volver.
      }
      const list = approvals.current;
      toast.custom(
        () => (
          <ApprovalAlert
            approvals={list}
            onView={() => {
              clearApprovals();
              router.push("/tickets");
            }}
            onClose={clearApprovals}
          />
        ),
        { id: APPROVAL_ID, duration: Infinity, onDismiss: () => (approvals.current = []) },
      );
      try {
        navigator.vibrate?.([300, 150, 300]);
      } catch {
        // Sin vibración: solo el aviso.
      }
    };

    // Punto de partida: los totales de ahora (lo de antes de abrir la app no se avisa).
    void supabase
      .from("tickets_avisos")
      .select("creados, urgentes, aprobados_admin")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        if (!seen.current) seen.current = { created: data.creados, urgent: data.urgentes };
        if (seenApprovals.current === null) seenApprovals.current = data.aprobados_admin;
      });

    const channel = supabase
      .channel("tickets-taller")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets_avisos" }, (payload) => {
        const ping = (payload.new ?? {}) as Ping;
        if (typeof ping.creados === "number" && typeof ping.urgentes === "number") {
          const now: Totals = { created: ping.creados, urgent: ping.urgentes };
          const before = seen.current;
          // Los avisos pueden llegar en desorden: solo cuenta si el total creció.
          if (!before || now.created > before.created) {
            let created = before ? now.created - before.created : ping.tipo === "insert" ? 1 : 0;
            let urgent = before ? Math.max(0, now.urgent - before.urgent) : 0;
            // El que lo levantó no necesita el aviso de su propio ticket (si fue el único nuevo).
            if (created === 1 && ping.creado_por === userId) {
              created = 0;
              urgent = 0;
            }
            seen.current = now;
            if (notifyNew && created > 0) {
              unseen.current = {
                created: unseen.current.created + created,
                urgent: unseen.current.urgent + urgent,
              };
              showAlert();
            }
          }
        }
        if (typeof ping.aprobados_admin === "number") {
          const before = seenApprovals.current;
          if (before === null) {
            seenApprovals.current = ping.aprobados_admin;
          } else if (ping.aprobados_admin > before) {
            seenApprovals.current = ping.aprobados_admin;
            if (notifyApprovals) void showApprovals(ping.aprobados_admin - before);
          }
        }
        refreshSoon();
      })
      .subscribe();

    return () => {
      active = false;
      if (timer.current) window.clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, notifyNew, notifyApprovals, userId]);

  return null;
}

/** Aviso de tickets nuevos: ancho, letra grande y botones de 48 px; rojo si hay alguno urgente. */
function NewTicketAlert({
  created,
  urgent,
  onView,
  onClose,
}: {
  created: number;
  urgent: number;
  onView: () => void;
  onClose: () => void;
}) {
  const isUrgent = urgent > 0;
  const title =
    created === 1
      ? isUrgent
        ? "Llegó un ticket de taller URGENTE"
        : "Llegó un ticket de taller"
      : `Llegaron ${created} tickets de taller`;
  const detail =
    created > 1 && isUrgent
      ? `${urgent === created ? (created === 2 ? "Los dos son urgentes" : "Todos son urgentes") : urgent === 1 ? "1 es urgente" : `${urgent} son urgentes`}. Ábrelos para aceptarlos o rechazarlos.`
      : created > 1
        ? "Ábrelos para aceptarlos o rechazarlos."
        : "Ábrelo para aceptarlo o rechazarlo.";

  return (
    <div
      role="alert"
      className={cn(
        "flex w-[min(92vw,28rem)] min-w-0 items-start gap-3 rounded-2xl border-2 p-4 shadow-xl",
        isUrgent ? "border-red-700 bg-red-700 text-white" : "border-amber-500 bg-amber-50 text-amber-950",
      )}
    >
      <TicketCheck className={cn("mt-0.5 size-8 shrink-0", isUrgent ? "text-white" : "text-amber-700")} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-snug font-bold">{title}</p>
        <p className={cn("mt-0.5 text-base", isUrgent ? "text-white/90" : "text-amber-900")}>{detail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onView}
            className={cn(
              "inline-flex min-h-12 items-center rounded-lg px-5 text-base font-semibold outline-none focus-visible:ring-3",
              isUrgent ? "bg-white text-red-800 focus-visible:ring-white/60" : "bg-amber-700 text-white focus-visible:ring-amber-700/40",
            )}
          >
            Ver tickets
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex min-h-12 items-center rounded-lg px-4 text-base font-medium outline-none hover:underline focus-visible:ring-3",
              isUrgent ? "text-white underline-offset-2 focus-visible:ring-white/60" : "text-amber-950 focus-visible:ring-amber-700/40",
            )}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Aviso de aprobaciones de admin para los capturistas: quién aprobó qué, hasta que lo cierren. */
function ApprovalAlert({ approvals, onView, onClose }: { approvals: AdminApproval[]; onView: () => void; onClose: () => void }) {
  return (
    <div
      role="alert"
      className="flex w-[min(92vw,28rem)] min-w-0 items-start gap-3 rounded-2xl border-2 border-brand-ink bg-brand-ink p-4 text-white shadow-xl"
    >
      <ShieldCheck className="mt-0.5 size-8 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <ul className="space-y-1">
          {approvals.map((a) => (
            <li key={a.id} className="text-lg leading-snug font-bold">
              {a.approverName ?? "Un administrador"} aprobó el ticket de {a.economicNumber}
            </li>
          ))}
        </ul>
        <p className="mt-0.5 text-base text-white/90">
          {approvals.length === 1 ? "Ya entró a taller; no hay que aceptarlo." : "Ya entraron a taller; no hay que aceptarlos."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onView}
            className="inline-flex min-h-12 items-center rounded-lg bg-white px-5 text-base font-semibold text-brand-ink outline-none focus-visible:ring-3 focus-visible:ring-white/60"
          >
            Ver tickets
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 items-center rounded-lg px-4 text-base font-medium text-white outline-none hover:underline focus-visible:ring-3 focus-visible:ring-white/60"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
