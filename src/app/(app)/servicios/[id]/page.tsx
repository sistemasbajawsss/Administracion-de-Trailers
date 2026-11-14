import { Lock, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { BackButton } from "@/components/shared/back-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { getMonthLock } from "@/features/cierres/queries";
import { ReceiptsSection, ReceiptsSectionSkeleton } from "@/features/comprobantes/components/receipts-section";
import { ChangeHistory, ChangeHistorySkeleton } from "@/features/servicios/components/change-history";
import { DeleteServiceDialog } from "@/features/servicios/components/delete-service-dialog";
import { ServiceDetailView } from "@/features/servicios/components/service-detail";
import { getService } from "@/features/servicios/queries";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { formatDate } from "@/lib/utils/format";
import { closedMonthMessage, isMonthClosed } from "@/lib/utils/month-lock";

export const metadata: Metadata = { title: "Servicio" };

async function Service({ params }: { params: PageProps<"/servicios/[id]">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  // RLS: si el servicio no es del capturista, no llega y se muestra 404.
  const [user, service, monthLock] = await Promise.all([getCurrentUser(), getService(id), getMonthLock()]);
  if (!service) notFound();

  const isAdmin = user.role === "admin";
  // RLS ya limita al capturista a sus servicios; el gerente solo ve.
  const canEdit = user.role !== "gerente";
  // Cierre de mes (5I): con el mes cerrado, el capturista solo agrega facturas.
  const lockedForMe = canEdit && !isAdmin && isMonthClosed(service.date, monthLock);

  return (
    // data-wide: en pantallas anchas esta página usa más ancho que el resto (layout).
    <div data-wide>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 xl:mb-4">
        <BackButton fallback="/servicios" />
        <div className="flex gap-2">
          {canEdit && !lockedForMe && (
            <Link href={`/servicios/${service.id}/editar`} className={buttonVariants({ variant: "outline", size: "touch" })}>
              <Pencil aria-hidden="true" />
              Editar
            </Link>
          )}
          {lockedForMe && (
            <Button variant="outline" size="touch" disabled aria-describedby="mes-cerrado">
              <Lock aria-hidden="true" />
              Editar
            </Button>
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
      {lockedForMe && (
        <p id="mes-cerrado" className="-mt-3 mb-6 flex items-start gap-2 text-sm text-muted-foreground xl:mt-0 xl:mb-4">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            {closedMonthMessage(service.date)} Sí puedes agregarle facturas.
          </span>
        </p>
      )}

      {/*
        Pantallas anchas: ticket y, debajo, comprobantes a la izquierda. La línea de
        cambios queda fija a la derecha, a la vista al entrar, y es lo único con scroll
        propio (cuando hay muchos cambios). Celular: una columna, como antes.
      */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start xl:gap-6">
        <div className="min-w-0">
          <h1 className="sr-only">
            Servicio de {service.unit.economicNumber} del {formatDate(service.date)}
          </h1>
          <ServiceDetailView service={service} />

          <Suspense fallback={<ReceiptsSectionSkeleton className="mt-10 xl:mt-6" />}>
            <ReceiptsSection
              serviceId={service.id}
              title={`${service.unit.economicNumber} · ${formatDate(service.date)}`}
              canEdit={canEdit}
              canRemove={canEdit && !lockedForMe}
              className="mt-10 xl:mt-6"
            />
          </Suspense>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-6">
          <Suspense fallback={<ChangeHistorySkeleton className="mt-10 xl:mt-0" />}>
            <ChangeHistory
              serviceId={service.id}
              // 9rem = margen de arriba de la página (2.5) + barra de Volver / Editar (3) +
              // su separación (1) + margen de abajo (2.5): la tarjeta termina justo en el
              // borde de la ventana y lo que se desliza son los cambios, no la página.
              className="mt-10 xl:mt-0 xl:max-h-[calc(100dvh-9rem)] xl:overflow-y-auto xl:overscroll-contain xl:rounded-xl xl:border xl:bg-white xl:p-5 xl:[scrollbar-gutter:stable]"
            />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}

export default function ServicioPage({ params }: PageProps<"/servicios/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <Service params={params} />
    </Suspense>
  );
}
