import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { listUnitOptions } from "@/features/servicios/queries";
import { TicketForm } from "@/features/tickets/components/ticket-form";
import { listUnitsWithPendingTicket } from "@/features/tickets/queries";
import { requireRole } from "@/lib/auth/get-current-user";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";

export const metadata: Metadata = { title: "Levantar ticket" };

async function NewTicket({ searchParams }: { searchParams: PageProps<"/tickets/nuevo">["searchParams"] }) {
  const [, params, allUnits, withTicket] = await Promise.all([
    requireRole(VIEW_ALL_ROLES),
    searchParams,
    listUnitOptions(),
    listUnitsWithPendingTicket(),
  ]);

  // La BD no acepta ticket de una unidad en taller o que ya tiene uno pendiente: no se ofrecen.
  const units = allUnits.filter((u) => u.status !== "en_taller" && !withTicket.has(u.id));

  if (units.length === 0) {
    return (
      <EmptyState
        title="No hay unidades disponibles"
        description="Todas las unidades activas ya están en taller o ya tienen un ticket pendiente."
      />
    );
  }

  // ?unidad=<id> deja la unidad elegida (p. ej. desde su ficha).
  const requested = z.uuid().safeParse(params.unidad);
  const initialUnitId = requested.success && units.some((u) => u.id === requested.data) ? requested.data : "";

  return <TicketForm units={units} initialUnitId={initialUnitId} />;
}

export default function NewTicketPage({ searchParams }: PageProps<"/tickets/nuevo">) {
  return (
    <>
      <PageHeader
        title="Levantar ticket"
        description="Elige la unidad, describe la falla y su prioridad. Les llega a todos los capturistas."
      />
      <Suspense fallback={<div className="h-96 max-w-3xl animate-pulse rounded-xl bg-muted" />}>
        <NewTicket searchParams={searchParams} />
      </Suspense>
    </>
  );
}
