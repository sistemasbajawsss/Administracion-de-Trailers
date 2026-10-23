import { ChevronLeft, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { buttonVariants } from "@/components/ui/button";
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

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={isAdmin ? `/unidades/${service.unit.id}` : "/servicios"}
          className={buttonVariants({ variant: "ghost", size: "touch" })}
        >
          <ChevronLeft aria-hidden="true" />
          {isAdmin ? `Ficha de ${service.unit.economicNumber}` : "Mis servicios"}
        </Link>
        <div className="flex gap-2">
          <Link href={`/servicios/${service.id}/editar`} className={buttonVariants({ variant: "outline", size: "touch" })}>
            <Pencil aria-hidden="true" />
            Editar
          </Link>
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
