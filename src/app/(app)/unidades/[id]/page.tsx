import { ChevronLeft, ClipboardPlus, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { buttonVariants } from "@/components/ui/button";
import { RequireRole } from "@/features/auth/components/require-role";
import { ServiceList, ServiceListSkeleton } from "@/features/servicios/components/service-list";
import { getUnitTotals } from "@/features/servicios/queries";
import { serviceFiltersSchema } from "@/features/servicios/schemas";
import { UnitStatusBadge } from "@/features/unidades/components/unit-status-badge";
import { getUnit } from "@/features/unidades/queries";
import { UNIT_OPERATION_LABELS, UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";
import { formatDate, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Ficha de unidad" };

type Props = PageProps<"/unidades/[id]">;

async function UnitSheet({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const [user, unit, totals] = await Promise.all([getCurrentUser(), getUnit(id), getUnitTotals(id)]);
  if (!unit) notFound();
  const isAdmin = user.role === "admin";

  const filters = serviceFiltersSchema.parse(query);
  const group = unit.type === "camioneta" ? "camionetas" : unit.operation === "foraneo" ? "foraneo" : "local";
  const details = [
    UNIT_TYPE_LABELS[unit.type],
    unit.operation ? UNIT_OPERATION_LABELS[unit.operation] : null,
    unit.lengthFt ? `${unit.lengthFt} pies` : null,
    [unit.make, unit.model].filter(Boolean).join(" ") || null,
    unit.plates ? `Placas ${unit.plates}` : null,
  ].filter(Boolean);

  return (
    <>
      <Link
        href={group === "local" ? "/unidades" : `/unidades?grupo=${group}`}
        className={`${buttonVariants({ variant: "ghost", size: "touch" })} mb-4 -ml-3`}
      >
        <ChevronLeft aria-hidden="true" />
        Unidades
      </Link>

      <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-6xl leading-none font-bold tracking-wide text-brand-ink tabular-nums">
              {unit.economicNumber}
            </h1>
            <UnitStatusBadge status={unit.status} />
          </div>
          <p className="mt-3 text-lg">{details.join(" · ")}</p>
          <p className="text-muted-foreground">{unit.driverName ? `Chofer: ${unit.driverName}` : "Sin chofer asignado"}</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/unidades/${unit.id}/editar`} className={buttonVariants({ variant: "outline", size: "touch" })}>
              <Pencil aria-hidden="true" />
              Editar unidad
            </Link>
            {unit.status !== "baja" && (
              <Link href={`/servicios/nuevo?unidad=${unit.id}`} className={buttonVariants({ size: "touch" })}>
                <ClipboardPlus aria-hidden="true" />
                Registrar servicio
              </Link>
            )}
          </div>
        )}
      </header>

      <dl className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
        <div className="col-span-2 bg-brand-ink px-5 py-4 text-white sm:col-span-1">
          <dt className="text-sm text-white/75">Total invertido</dt>
          <dd className="font-heading text-4xl font-bold tabular-nums">{formatMoney(totals.total)}</dd>
        </div>
        <div className="bg-white px-5 py-4">
          <dt className="text-sm text-muted-foreground">Servicios</dt>
          <dd className="font-heading text-3xl font-semibold tabular-nums">{totals.serviceCount}</dd>
        </div>
        <div className="bg-white px-5 py-4">
          <dt className="text-sm text-muted-foreground">Último servicio</dt>
          <dd className="font-heading text-3xl font-semibold tabular-nums">
            {totals.lastServiceDate ? formatDate(totals.lastServiceDate) : "—"}
          </dd>
        </div>
      </dl>

      <h2 className="mb-4 text-2xl font-semibold">Historial de servicios</h2>
      <Suspense fallback={<ServiceListSkeleton />}>
        <ServiceList filters={{ ...filters, q: "", desde: undefined, hasta: undefined }} unitId={unit.id} pathname={`/unidades/${unit.id}`} />
      </Suspense>
    </>
  );
}

export default function UnidadPage({ params, searchParams }: Props) {
  return (
    <RequireRole role={VIEW_ALL_ROLES}>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <UnitSheet params={params} searchParams={searchParams} />
      </Suspense>
    </RequireRole>
  );
}
