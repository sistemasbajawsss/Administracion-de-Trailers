import { ClipboardPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ServiceFilters } from "@/features/servicios/components/service-filters";
import { ServiceList, ServiceListSkeleton } from "@/features/servicios/components/service-list";
import { serviceFiltersSchema } from "@/features/servicios/schemas";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export const metadata: Metadata = { title: "Servicios" };

const newServiceLink = (
  <Link href="/servicios/nuevo" className={buttonVariants({ size: "touch" })}>
    <ClipboardPlus aria-hidden="true" />
    Registrar servicio
  </Link>
);

async function ServicesContent({ searchParams }: { searchParams: PageProps<"/servicios">["searchParams"] }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const filters = serviceFiltersSchema.parse(params);
  const isAdmin = user.role === "admin";

  return (
    <>
      <PageHeader
        title={isAdmin ? "Servicios" : "Mis servicios"}
        description={
          isAdmin
            ? "Reparaciones y mantenimientos de todas las unidades."
            : "Los servicios que has capturado. Toca uno para ver el detalle o corregirlo."
        }
        actions={newServiceLink}
      />
      <ServiceFilters />
      <Suspense fallback={<ServiceListSkeleton />}>
        <ServiceList filters={filters} pathname="/servicios" emptyAction={newServiceLink} />
      </Suspense>
    </>
  );
}

export default function ServiciosPage({ searchParams }: PageProps<"/servicios">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Servicios" />
          <ServiceListSkeleton />
        </>
      }
    >
      <ServicesContent searchParams={searchParams} />
    </Suspense>
  );
}
