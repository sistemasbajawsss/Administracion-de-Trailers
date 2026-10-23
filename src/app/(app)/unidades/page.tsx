import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { RequireRole } from "@/features/auth/components/require-role";
import {
  UnitGroupTabs,
  UnitGroupTabsSkeleton,
} from "@/features/unidades/components/unit-group-tabs";
import { UnitFilters } from "@/features/unidades/components/unit-filters";
import { UnitList, UnitListSkeleton } from "@/features/unidades/components/unit-list";
import { unitFiltersSchema } from "@/features/unidades/schemas";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";

export const metadata: Metadata = { title: "Unidades" };

/** Solo el admin da de alta unidades; el gerente solo consulta. */
async function NewUnitButton() {
  const user = await getCurrentUser();
  if (user.role !== "admin") return null;
  return (
    <Link href="/unidades/nueva" className={buttonVariants({ size: "touch" })}>
      <Plus aria-hidden="true" />
      Nueva unidad
    </Link>
  );
}

async function UnitsContent({ searchParams }: { searchParams: PageProps<"/unidades">["searchParams"] }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const filters = unitFiltersSchema.parse(params);

  return (
    <>
      <Suspense fallback={<UnitGroupTabsSkeleton />}>
        <UnitGroupTabs current={filters.grupo} />
      </Suspense>
      <UnitFilters />
      <Suspense fallback={<UnitListSkeleton />}>
        <UnitList filters={filters} canEdit={user.role === "admin"} />
      </Suspense>
    </>
  );
}

export default function UnidadesPage({ searchParams }: PageProps<"/unidades">) {
  return (
    <RequireRole role={VIEW_ALL_ROLES}>
      <PageHeader
        title="Unidades"
        description="Trailers, cajas, camiones rabones, pipas y camionetas de la flotilla."
        actions={
          <Suspense fallback={null}>
            <NewUnitButton />
          </Suspense>
        }
      />
      <Suspense fallback={<UnitListSkeleton />}>
        <UnitsContent searchParams={searchParams} />
      </Suspense>
    </RequireRole>
  );
}
