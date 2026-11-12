import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { listUnitOptions } from "@/features/servicios/queries";
import { ShopEntryForm } from "@/features/taller/components/shop-entry-form";
import { listUnitsWithPendingTicket } from "@/features/tickets/queries";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES } from "@/lib/auth/types";
import { todayInTijuana } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Entrada a taller" };

async function NewShopEntry({ searchParams }: { searchParams: PageProps<"/taller/entrada">["searchParams"] }) {
  const [, params, allUnits, withTicket] = await Promise.all([
    requireRole(CAPTURE_ROLES),
    searchParams,
    listUnitOptions(),
    listUnitsWithPendingTicket(),
  ]);

  // Las que ya están en taller no pueden entrar otra vez; las que tienen ticket
  // pendiente entran aceptándolo en Tickets (5H, D16; la BD también lo revisa).
  const units = allUnits.filter((u) => u.status !== "en_taller" && !withTicket.has(u.id));

  if (units.length === 0) {
    return (
      <EmptyState
        title="No hay unidades disponibles"
        description={withTicket.size > 0 ? "Las unidades activas ya están en taller o tienen un ticket pendiente (se aceptan en Tickets)." : "Todas las unidades activas ya están en taller."}
      />
    );
  }

  // ?unidad=<id> deja la unidad elegida (p. ej. desde su ficha).
  const requested = z.uuid().safeParse(params.unidad);
  const initialUnitId = requested.success && units.some((u) => u.id === requested.data) ? requested.data : "";

  return (
    <>
      {withTicket.size > 0 && (
        <p className="mb-6 max-w-3xl rounded-xl border bg-white px-4 py-3 text-sm">
          {withTicket.size === 1 ? "Una unidad tiene" : `${withTicket.size} unidades tienen`} ticket pendiente y no sale{withTicket.size === 1 ? "" : "n"} aquí: se
          {withTicket.size === 1 ? " acepta" : " aceptan"} en{" "}
          <Link href="/tickets" className="font-medium underline underline-offset-2">Tickets</Link>.
        </p>
      )}
      <ShopEntryForm units={units} today={todayInTijuana()} initialUnitId={initialUnitId} />
    </>
  );
}

export default function ShopEntryPage({ searchParams }: PageProps<"/taller/entrada">) {
  return (
    <>
      <PageHeader title="Entrada a taller" description="Elige la unidad y describe la falla. Pasará a En taller." />
      <Suspense fallback={<div className="h-96 max-w-3xl animate-pulse rounded-xl bg-muted" />}>
        <NewShopEntry searchParams={searchParams} />
      </Suspense>
    </>
  );
}
