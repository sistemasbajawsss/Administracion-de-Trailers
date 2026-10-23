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

export const metadata: Metadata = { title: "Unidades" };

async function UnitsContent({ searchParams }: { searchParams: PageProps<"/unidades">["searchParams"] }) {
  const filters = unitFiltersSchema.parse(await searchParams);

  return (
    <>
      <Suspense fallback={<UnitGroupTabsSkeleton />}>
        <UnitGroupTabs current={filters.grupo} />
      </Suspense>
      <UnitFilters />
      <Suspense fallback={<UnitListSkeleton />}>
        <UnitList filters={filters} />
      </Suspense>
    </>
  );
}

export default function UnidadesPage({ searchParams }: PageProps<"/unidades">) {
  return (
    <RequireRole role="admin">
      <PageHeader
        title="Unidades"
        description="Trailers, cajas, camiones rabones, pipas y camionetas de la flotilla."
        actions={
          <Link href="/unidades/nueva" className={buttonVariants({ size: "touch" })}>
            <Plus aria-hidden="true" />
            Nueva unidad
          </Link>
        }
      />
      <Suspense fallback={<UnitListSkeleton />}>
        <UnitsContent searchParams={searchParams} />
      </Suspense>
    </RequireRole>
  );
}
