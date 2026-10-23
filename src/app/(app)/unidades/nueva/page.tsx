import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";
import { listActiveDrivers } from "@/features/catalogos/queries";
import { UnitForm } from "@/features/unidades/components/unit-form";

export const metadata: Metadata = { title: "Nueva unidad" };

async function NewUnitForm() {
  const drivers = await listActiveDrivers();
  return <UnitForm drivers={drivers} />;
}

export default function NuevaUnidadPage() {
  return (
    <RequireRole role="admin">
      <PageHeader title="Nueva unidad" />
      <Suspense fallback={<div className="h-96 max-w-3xl animate-pulse rounded-lg bg-muted" />}>
        <NewUnitForm />
      </Suspense>
    </RequireRole>
  );
}
