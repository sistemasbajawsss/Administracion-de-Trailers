import { ChevronRight, CircleAlert, TicketCheck } from "lucide-react";
import Link from "next/link";

import { HomePanel, HomePanelEmpty } from "@/components/shared/home-panel";
import { buttonVariants } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth/types";
import { formatElapsed } from "@/lib/utils/format";

import { listPendingTickets, listUnseenRejections } from "../queries";
import type { Ticket } from "../types";
import { AcknowledgeButton, PriorityChip } from "./ticket-item";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Aviso de un ticket propio rechazado, hasta tocar "Enterado" (5H, D16). */
function RejectionNotice({ ticket }: { ticket: Ticket }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-red-500/40 border-l-4 border-l-red-600 bg-red-50 px-4 py-2">
      <CircleAlert className="size-6 shrink-0 text-red-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-base text-red-950">
        <span className="font-bold">Rechazaron tu ticket de {ticket.economicNumber}</span>
        {ticket.attendedName && ` (${ticket.attendedName})`}: <span className="whitespace-pre-line">{ticket.rejectReason}</span>
      </p>
      <AcknowledgeButton ticket={ticket} className="mt-0" />
    </div>
  );
}

/**
 * Inicio del admin: los tickets van arriba de la cuadrícula, cada aviso en un
 * solo renglón (la cuadrícula de 2 x 2 ya está llena): cuántos pendientes hay
 * y sus propios tickets rechazados sin ver. Sin nada que atender, no se muestra.
 */
export async function AdminTicketsBanner({ user }: { user: CurrentUser }) {
  const [pending, rejected] = await Promise.all([listPendingTickets(), listUnseenRejections(user.id)]);
  if (pending.length === 0 && rejected.length === 0) return null;
  const urgent = pending.filter((t) => t.priority === "urgente").length;

  return (
    <div className="mb-6 grid gap-2">
      {pending.length > 0 && (
        <section
          aria-label="Tickets de taller pendientes"
          className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-l-4 px-4 py-2 ${
            urgent > 0 ? "border-red-500/40 border-l-red-600 bg-red-50" : "border-amber-400/50 border-l-amber-500 bg-amber-50"
          }`}
        >
          <TicketCheck className={`size-6 shrink-0 ${urgent > 0 ? "text-red-700" : "text-amber-800"}`} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-base">
            <span className="font-bold">Tickets de taller:</span>{" "}
            <span className="font-bold tabular-nums">{pending.length}</span> {plural(pending.length, "pendiente", "pendientes")}
            {urgent > 0 && (
              <>
                , <span className="font-bold tabular-nums">{urgent}</span> {plural(urgent, "urgente", "urgentes")}
              </>
            )}
            .
          </p>
          <Link
            href="/tickets"
            className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-base font-semibold text-white outline-none focus-visible:ring-3 ${
              urgent > 0 ? "bg-red-700 hover:bg-red-800 focus-visible:ring-red-700/40" : "bg-amber-700 hover:bg-amber-800 focus-visible:ring-amber-700/40"
            }`}
          >
            Ver tickets
          </Link>
        </section>
      )}
      {rejected.map((ticket) => (
        <RejectionNotice key={ticket.id} ticket={ticket} />
      ))}
    </div>
  );
}

/**
 * Tarjeta "Tickets de taller" del Inicio del capturista (los pendientes, para
 * aceptarlos) y del gerente (sus rechazos sin ver primero y luego los
 * pendientes). Urgentes primero y luego el más viejo.
 */
export async function TicketsHomePanel({
  user,
  now,
  rows = 3,
  className,
}: {
  user: CurrentUser;
  now: string;
  rows?: number;
  className?: string;
}) {
  const showRejections = user.role === "gerente";
  const [pending, rejected] = await Promise.all([
    listPendingTickets(),
    showRejections ? listUnseenRejections(user.id) : Promise.resolve([] as Ticket[]),
  ]);
  const shownRejections = rejected.slice(0, rows);
  const shownPending = pending.slice(0, Math.max(0, rows - shownRejections.length));
  const hidden = pending.length + rejected.length - shownRejections.length - shownPending.length;

  return (
    <HomePanel
      title="Tickets de taller"
      count={pending.length}
      description={user.role === "capturista" ? "El primero que lo acepta le da la entrada a taller." : undefined}
      className={className}
      footer={
        <Link href="/tickets" className={`${buttonVariants({ variant: "outline", size: "touch" })} w-full sm:w-auto`}>
          {hidden > 0 ? `Ver los ${pending.length + rejected.length} en Tickets` : "Ver Tickets"}
        </Link>
      }
    >
      {pending.length === 0 && rejected.length === 0 ? (
        <HomePanelEmpty>No hay tickets pendientes.</HomePanelEmpty>
      ) : (
        <ul className="divide-y">
          {shownRejections.map((ticket) => (
            <li key={ticket.id} className="py-2">
              <p className="text-sm text-red-950">
                <span className="font-bold">Rechazaron tu ticket de {ticket.economicNumber}:</span>{" "}
                <span className="whitespace-pre-line">{ticket.rejectReason}</span>
              </p>
              <AcknowledgeButton ticket={ticket} className="mt-2" />
            </li>
          ))}
          {shownPending.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href="/tickets"
                className="flex min-h-14 items-center gap-3 px-1 py-2 outline-none hover:bg-muted/50 focus-visible:bg-muted"
              >
                <span className="w-14 shrink-0 font-heading text-lg font-bold tracking-wide text-brand-ink tabular-nums">
                  {ticket.economicNumber}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block whitespace-pre-line">{ticket.fault}</span>
                  <span className="block text-muted-foreground">Espera hace {formatElapsed(ticket.createdAt, now)}</span>
                </span>
                <PriorityChip priority={ticket.priority} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomePanel>
  );
}
