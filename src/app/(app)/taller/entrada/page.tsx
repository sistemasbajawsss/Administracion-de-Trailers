import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { listUnitOptions } from "@/features/servicios/queries";
import { ShopEntryForm } from "@/features/taller/components/shop-entry-form";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES } from "@/lib/auth/types";
import { todayInTijuana } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Entrada a taller" };

async function NewShopEntry({ searchParams }: { searchParams: PageProps<"/taller/entrada">["searchParams"] }) {
  const [, params, allUnits] = await Promise.all([requireRole(CAPTURE_ROLES), searchParams, listUnitOptions()]);

  // Las que ya están en taller no pueden entrar otra vez.
  const units = allUnits.filter((u) => u.status !== "en_taller");

  if (units.length === 0) {
    return (
      <EmptyState
        title="No hay unidades disponibles"
        description="Todas las unidades activas ya están en taller."
      />
    );
  }

  // ?unidad=<id> deja la unidad elegida (p. ej. desde su ficha).
  const requested = z.uuid().safeParse(params.unidad);
  const initialUnitId = requested.success && units.some((u) => u.id === requested.data) ? requested.data : "";

  return <ShopEntryForm units={units} today={todayInTijuana()} initialUnitId={initialUnitId} />;
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
