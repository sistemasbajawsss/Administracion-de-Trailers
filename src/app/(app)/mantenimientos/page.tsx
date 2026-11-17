import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { FleetMaintenanceList } from "@/features/mantenimientos/components/fleet-maintenance";
import { MaintenanceTabs } from "@/features/mantenimientos/components/maintenance-tabs";
import { getMaintenanceWarnings, listFleetMaintenance } from "@/features/mantenimientos/queries";
import { maintenanceFiltersSchema } from "@/features/mantenimientos/schemas";
import { ServiceBriefFeed } from "@/features/servicios/components/service-brief-feed";
import { listServicesOfType, SERVICES_BY_TYPE_BATCH_SIZE } from "@/features/servicios/queries";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES, ROLES, VIEW_ALL_ROLES } from "@/lib/auth/types";

export const metadata: Metadata = { title: "Mantenimientos" };

const includes = (roles: readonly string[], role: string) => roles.includes(role);

/** Correctivos: lo que le toca a cada unidad (los tres roles ven lo mismo). */
async function Correctives() {
  const [user, items, warnings] = await Promise.all([requireRole(ROLES), listFleetMaintenance(), getMaintenanceWarnings()]);
  return (
    <FleetMaintenanceList
      items={items}
      warnings={warnings}
      canRegister={includes(CAPTURE_ROLES, user.role)}
      canOpenUnits={includes(VIEW_ALL_ROLES, user.role)}
      canEdit={user.role === "admin"}
    />
  );
}

/** Preventivos: el historial, del más reciente al más viejo. RLS: el capturista ve los suyos. */
async function Preventives() {
  const [user, { services, total }] = await Promise.all([requireRole(ROLES), listServicesOfType("preventivo")]);
  if (total === 0) {
    return (
      <EmptyState
        title="Aún no hay servicios preventivos"
        description="Aparecen aquí los servicios que se registran con el tipo Preventivo."
      />
    );
  }
  return (
    <>
      <p className="mb-4 text-muted-foreground">
        {user.role === "capturista" ? "Tus servicios preventivos" : "Servicios preventivos"}, del más reciente al más viejo:{" "}
        <span className="tabular-nums">{total}</span> en total.
      </p>
      <ServiceBriefFeed type="preventivo" initialItems={services} totalCount={total} batchSize={SERVICES_BY_TYPE_BATCH_SIZE} />
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/mantenimientos">["searchParams"] }) {
  const filters = maintenanceFiltersSchema.parse(await searchParams);
  return (
    <>
      <MaintenanceTabs current={filters.vista} />
      {filters.vista === "preventivos" ? <Preventives /> : <Correctives />}
    </>
  );
}

export default function MantenimientosPage({ searchParams }: PageProps<"/mantenimientos">) {
  return (
    <>
      <PageHeader
        title="Mantenimientos"
        description="Qué hay que hacer ahora, qué conviene programar antes del próximo viaje y lo que le toca a cada unidad."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}
