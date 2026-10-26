import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { BackButton } from "@/components/shared/back-button";
import { buttonVariants } from "@/components/ui/button";
import { ReceiptsSection, ReceiptsSectionSkeleton } from "@/features/comprobantes/components/receipts-section";
import { ChangeHistory, ChangeHistorySkeleton } from "@/features/servicios/components/change-history";
import { DeleteServiceDialog } from "@/features/servicios/components/delete-service-dialog";
import { ServiceDetailView } from "@/features/servicios/components/service-detail";
import { getService } from "@/features/servicios/queries";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Servicio" };

async function Service({ params }: { params: PageProps<"/servicios/[id]">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  // RLS: si el servicio no es del capturista, no llega y se muestra 404.
  const [user, service] = await Promise.all([getCurrentUser(), getService(id)]);
  if (!service) notFound();

  const isAdmin = user.role === "admin";
  // RLS ya limita al capturista a sus servicios; el gerente solo ve.
  const canEdit = user.role !== "gerente";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <BackButton fallback="/servicios" />
        <div className="flex gap-2">
          {canEdit && (
            <Link href={`/servicios/${service.id}/editar`} className={buttonVariants({ variant: "outline", size: "touch" })}>
              <Pencil aria-hidden="true" />
              Editar
            </Link>
          )}
          {isAdmin && (
            <DeleteServiceDialog
              serviceId={service.id}
              unitId={service.unit.id}
              label={`el servicio de ${service.unit.economicNumber} del ${formatDate(service.date)}`}
            />
          )}
        </div>
      </div>

      <h1 className="sr-only">
        Servicio de {service.unit.economicNumber} del {formatDate(service.date)}
      </h1>
      <ServiceDetailView service={service} />

      <Suspense fallback={<ReceiptsSectionSkeleton />}>
        <ReceiptsSection
          serviceId={service.id}
          title={`${service.unit.economicNumber} · ${formatDate(service.date)}`}
          canEdit={canEdit}
        />
      </Suspense>

      <Suspense fallback={<ChangeHistorySkeleton />}>
        <ChangeHistory serviceId={service.id} />
      </Suspense>
    </>
  );
}

export default function ServicioPage({ params }: PageProps<"/servicios/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <Service params={params} />
    </Suspense>
  );
}
