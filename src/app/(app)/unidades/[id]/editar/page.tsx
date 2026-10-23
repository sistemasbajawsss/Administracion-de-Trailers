import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";
import { listActiveDrivers } from "@/features/catalogos/queries";
import { UnitForm } from "@/features/unidades/components/unit-form";
import { getUnit } from "@/features/unidades/queries";

export const metadata: Metadata = { title: "Editar unidad" };

async function EditUnit({ params }: { params: PageProps<"/unidades/[id]/editar">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [unit, drivers] = await Promise.all([getUnit(id), listActiveDrivers()]);
  if (!unit) notFound();

  return (
    <>
      <PageHeader title={`Editar ${unit.economicNumber}`} />
      <UnitForm unit={unit} drivers={drivers} />
    </>
  );
}

export default function EditarUnidadPage({ params }: PageProps<"/unidades/[id]/editar">) {
  return (
    <RequireRole role="admin">
      <Suspense fallback={<div className="h-96 max-w-3xl animate-pulse rounded-lg bg-muted" />}>
        <EditUnit params={params} />
      </Suspense>
    </RequireRole>
  );
}
