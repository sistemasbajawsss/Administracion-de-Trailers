import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { TicketHistory, TicketList } from "@/features/tickets/components/ticket-history";
import {
  listPendingTickets,
  listTicketHistory,
  listUnseenRejections,
  TICKET_HISTORY_BATCH_SIZE,
} from "@/features/tickets/queries";
import { canAttendTickets, canCreateTickets } from "@/features/tickets/types";
import { requireRole } from "@/lib/auth/get-current-user";
import { ROLES, VIEW_ALL_ROLES } from "@/lib/auth/types";

export const metadata: Metadata = { title: "Tickets de taller" };

const DESCRIPTIONS = {
  admin: "Levanta tickets para que una unidad entre a taller, y acepta o rechaza los pendientes.",
  capturista: "Unidades que piden entrar a taller. El primero que acepta un ticket le da la entrada.",
  gerente: "Pide que una unidad entre a taller. Los capturistas lo aceptan o lo rechazan con un motivo.",
} as const;

async function Content() {
  const user = await requireRole(ROLES);
  const [pending, rejected, history] = await Promise.all([
    listPendingTickets(),
    canCreateTickets(user) ? listUnseenRejections(user.id) : Promise.resolve([]),
    listTicketHistory(),
  ]);
  const now = new Date().toISOString();
  const viewer = { id: user.id, role: user.role };
  const linkUnit = (VIEW_ALL_ROLES as readonly string[]).includes(user.role);

  return (
    <>
      <PageHeader
        title="Tickets de taller"
        description={DESCRIPTIONS[user.role]}
        actions={
          canCreateTickets(user) && (
            <Link href="/tickets/nuevo" className={buttonVariants({ size: "touch" })}>
              <Plus aria-hidden="true" />
              Levantar ticket
            </Link>
          )
        }
      />

      {rejected.length > 0 && (
        <section aria-labelledby="tickets-rechazados" className="mb-10">
          <h2 id="tickets-rechazados" className="mb-1 text-2xl font-semibold">Te los rechazaron</h2>
          <p className="mb-4 text-sm text-muted-foreground">Toca &ldquo;Enterado&rdquo; para quitar el aviso de tu Inicio.</p>
          <TicketList tickets={rejected} viewer={viewer} now={now} linkUnit={linkUnit} label="Tickets rechazados sin ver" />
        </section>
      )}

      <section aria-labelledby="tickets-pendientes" className="mb-10">
        <h2 id="tickets-pendientes" className="mb-1 text-2xl font-semibold">
          Pendientes
          <span className="ml-2 text-base font-normal text-muted-foreground tabular-nums">{pending.length}</span>
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {canAttendTickets(user)
            ? "Urgentes primero y luego el que lleva más esperando. Se actualiza solo."
            : "Urgentes primero y luego el que lleva más esperando. Se actualiza solo cuando un capturista lo atiende."}
        </p>
        {pending.length === 0 ? (
          <p className="rounded-xl border bg-white px-4 py-6 text-muted-foreground">No hay tickets pendientes.</p>
        ) : (
          <TicketList tickets={pending} viewer={viewer} now={now} linkUnit={linkUnit} label="Tickets pendientes" />
        )}
      </section>

      <section aria-labelledby="tickets-historial">
        <h2 id="tickets-historial" className="mb-1 text-2xl font-semibold">
          Historial
          <span className="ml-2 text-base font-normal text-muted-foreground tabular-nums">{history.total}</span>
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">Aceptados, rechazados y cancelados, el más nuevo primero.</p>
        <TicketHistory
          // key: con tickets nuevos en el historial, la lista empieza de cero.
          key={`${history.total}|${history.tickets[0]?.id ?? ""}|${history.tickets[0]?.status ?? ""}`}
          initialTickets={history.tickets}
          total={history.total}
          batchSize={TICKET_HISTORY_BATCH_SIZE}
          viewer={viewer}
          now={now}
          linkUnit={linkUnit}
        />
      </section>
    </>
  );
}

export default function TicketsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Tickets de taller" />
          <div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        </>
      }
    >
      <Content />
    </Suspense>
  );
}
