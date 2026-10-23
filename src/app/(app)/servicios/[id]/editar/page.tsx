import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { listActiveCategories, listActiveSuppliers } from "@/features/catalogos/queries";
import { ServiceForm } from "@/features/servicios/components/service-form";
import { getService, listUnitOptions } from "@/features/servicios/queries";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES } from "@/lib/auth/types";
import { formatDate, todayInTijuana } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Editar servicio" };

async function EditService({ params }: { params: PageProps<"/servicios/[id]/editar">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [, service, units, categories, suppliers] = await Promise.all([
    requireRole(CAPTURE_ROLES),
    getService(id),
    listUnitOptions(),
    listActiveCategories(),
    listActiveSuppliers(),
  ]);
  if (!service) notFound();

  // Categorías o proveedores desactivados después de capturar: se conservan en el formulario.
  const missingCategories = service.expenses
    .filter((e) => !categories.some((c) => c.id === e.categoryId))
    .map((e) => ({ id: e.categoryId, name: `${e.categoryName} (inactiva)`, requiresConcept: false }));
  const allSuppliers =
    service.supplierId && !suppliers.some((s) => s.id === service.supplierId)
      ? [...suppliers, { id: service.supplierId, name: `${service.supplierName ?? "Proveedor"} (inactivo)` }]
      : suppliers;

  return (
    <>
      <PageHeader
        title={`Editar servicio de ${service.unit.economicNumber}`}
        description={`Capturado el ${formatDate(service.date)}. Al guardar se pide el motivo del cambio.`}
      />
      <ServiceForm
        service={service}
        units={units}
        categories={[...categories, ...new Map(missingCategories.map((c) => [c.id, c])).values()]}
        suppliers={allSuppliers}
        today={todayInTijuana()}
      />
    </>
  );
}

export default function EditarServicioPage({ params }: PageProps<"/servicios/[id]/editar">) {
  return (
    <Suspense fallback={<div className="h-[32rem] max-w-3xl animate-pulse rounded-xl bg-muted" />}>
      <EditService params={params} />
    </Suspense>
  );
}
