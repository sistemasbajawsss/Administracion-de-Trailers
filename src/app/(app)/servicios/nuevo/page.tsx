import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { listActiveCategories, listActiveSuppliers, listActiveWorkshops } from "@/features/catalogos/queries";
import { ServiceForm } from "@/features/servicios/components/service-form";
import { listMaintenanceByUnit } from "@/features/mantenimientos/queries";
import { listUnitOptions } from "@/features/servicios/queries";
import { SERVICE_TYPES } from "@/features/servicios/types";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES } from "@/lib/auth/types";
import { todayInTijuana } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Registrar servicio" };

async function NewService({ searchParams }: { searchParams: PageProps<"/servicios/nuevo">["searchParams"] }) {
  const [, params, units, categories, suppliers, workshops, maintenanceByUnit] = await Promise.all([
    requireRole(CAPTURE_ROLES),
    searchParams,
    listUnitOptions(),
    listActiveCategories(),
    listActiveSuppliers(),
    listActiveWorkshops(),
    listMaintenanceByUnit(),
  ]);

  if (units.length === 0) {
    return (
      <EmptyState
        title="No hay unidades disponibles"
        description="Pide a un administrador que dé de alta las unidades de la flotilla."
      />
    );
  }

  // ?unidad=<id> llega desde la ficha de la unidad para dejarla elegida.
  const requested = z.uuid().safeParse(params.unidad);
  const initialUnitId = requested.success && units.some((u) => u.id === requested.data) ? requested.data : "";
  // "Registrar" desde Mantenimientos (5F): ?tipo=correctivo&mantenimiento=<id> de esa unidad.
  const type = z.enum(SERVICE_TYPES).safeParse(params.tipo);
  const initialServiceType = type.success ? type.data : "";
  const maintenanceId = z.uuid().safeParse(params.mantenimiento);
  const initialMaintenanceIds =
    initialServiceType === "correctivo" &&
    maintenanceId.success &&
    (maintenanceByUnit[initialUnitId] ?? []).some((m) => m.id === maintenanceId.data)
      ? [maintenanceId.data]
      : [];

  return (
    <ServiceForm
      units={units}
      categories={categories}
      suppliers={suppliers}
      workshops={workshops}
      today={todayInTijuana()}
      initialUnitId={initialUnitId}
      initialServiceType={initialServiceType}
      initialMaintenanceIds={initialMaintenanceIds}
      maintenanceByUnit={maintenanceByUnit}
    />
  );
}

export default function NuevoServicioPage({ searchParams }: PageProps<"/servicios/nuevo">) {
  return (
    <>
      <PageHeader title="Registrar servicio" description="Elige la unidad y captura cada gasto con su monto." />
      <Suspense fallback={<div className="h-[32rem] max-w-3xl animate-pulse rounded-xl bg-muted" />}>
        <NewService searchParams={searchParams} />
      </Suspense>
    </>
  );
}
