import { ArchiveRestore, ClipboardPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ServiceFilters } from "@/features/servicios/components/service-filters";
import { ExpenseList, ExpenseListSkeleton } from "@/features/servicios/components/expense-list";
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
  const seesAll = user.role !== "capturista";
  const canCapture = user.role !== "gerente";

  return (
    <>
      <PageHeader
        title={seesAll ? "Servicios" : "Mis servicios"}
        description={
          seesAll
            ? "Cada gasto con su fecha, categoría y factura. Toca uno para ver el servicio completo."
            : "Los gastos de los servicios que has capturado. Toca uno para ver el detalle o corregirlo."
        }
        actions={
          canCapture || user.role === "admin" ? (
            <>
              {user.role === "admin" && (
                <Link href="/servicios/eliminados" className={buttonVariants({ variant: "outline", size: "touch" })}>
                  <ArchiveRestore aria-hidden="true" />
                  Eliminados
                </Link>
              )}
              {canCapture && newServiceLink}
            </>
          ) : undefined
        }
      />
      <ServiceFilters />
      <Suspense fallback={<ExpenseListSkeleton />}>
        <ExpenseList filters={filters} emptyAction={canCapture ? newServiceLink : undefined} />
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
          <ExpenseListSkeleton />
        </>
      }
    >
      <ServicesContent searchParams={searchParams} />
    </Suspense>
  );
}
