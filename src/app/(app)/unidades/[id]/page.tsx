import { ClipboardPlus, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { BackButton } from "@/components/shared/back-button";
import { buttonVariants } from "@/components/ui/button";
import { RequireRole } from "@/features/auth/components/require-role";
import { ExpenseList, ExpenseListSkeleton } from "@/features/servicios/components/expense-list";
import { ServiceFilters } from "@/features/servicios/components/service-filters";
import { getUnitTotals } from "@/features/servicios/queries";
import { serviceFiltersSchema } from "@/features/servicios/schemas";
import { DeleteUnitZone } from "@/features/unidades/components/delete-unit-zone";
import { ShopStays } from "@/features/unidades/components/shop-stays";
import { SellUnitZone, SoldBanner } from "@/features/unidades/components/unit-sale";
import { UnitStatusBadge } from "@/features/unidades/components/unit-status-badge";
import { UnitMaintenance } from "@/features/mantenimientos/components/unit-maintenance";
import { listMaintenanceSources, listUnitMaintenance } from "@/features/mantenimientos/queries";
import { UnitMileageActions } from "@/features/unidades/components/unit-mileage";
import {
  getUnit,
  getUnitMileage,
  getUnitSale,
  listUnitShopStays,
  SHOP_STAYS_BATCH_SIZE,
} from "@/features/unidades/queries";
import { isRetired, MILEAGE_SOURCE_LABELS, UNIT_OPERATION_LABELS, UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";
import { formatDate, formatKm, formatMoney, todayInTijuana } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Ficha de unidad" };

type Props = PageProps<"/unidades/[id]">;

async function UnitSheet({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const [user, unit, totals, sale, shopStays, mileage, maintenance, maintenanceSources] = await Promise.all([
    getCurrentUser(),
    getUnit(id),
    getUnitTotals(id),
    getUnitSale(id),
    listUnitShopStays(id),
    getUnitMileage(id),
    listUnitMaintenance(id),
    listMaintenanceSources(id),
  ]);
  if (!unit) notFound();
  const isAdmin = user.role === "admin";
  // Las cajas no tienen odómetro (5F).
  const hasOdometer = unit.type !== "caja";

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
      <BackButton fallback={group === "local" ? "/unidades" : `/unidades?grupo=${group}`} className="mb-4" />

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
            {!isRetired(unit.status) && (
              <Link href={`/servicios/nuevo?unidad=${unit.id}`} className={buttonVariants({ size: "touch" })}>
                <ClipboardPlus aria-hidden="true" />
                Registrar servicio
              </Link>
            )}
          </div>
        )}
      </header>

      {sale && (
        <SoldBanner unitId={unit.id} economicNumber={unit.economicNumber} sale={sale} canUndo={isAdmin} />
      )}

      <dl
        className={`mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border ${hasOdometer ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}
      >
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
        {hasOdometer && (
          // En celular ocupa todo el renglón (con 2 columnas quedaría un hueco).
          <div className="col-span-2 min-w-0 bg-white px-5 py-4 sm:col-span-1">
            <dt className="text-sm text-muted-foreground">Kilometraje</dt>
            <dd className="min-w-0">
              <span className="block font-heading text-3xl font-semibold whitespace-nowrap tabular-nums">
                {mileage.last ? formatKm(mileage.last.km) : "Sin registrar"}
              </span>
              {mileage.last && (
                <span className="block text-sm text-muted-foreground">
                  Al {formatDate(mileage.last.date)}, {MILEAGE_SOURCE_LABELS[mileage.last.source]}
                </span>
              )}
              <UnitMileageActions
                unitId={unit.id}
                economicNumber={unit.economicNumber}
                mileage={mileage}
                canCorrect={isAdmin && !isRetired(unit.status)}
                today={todayInTijuana()}
              />
            </dd>
          </div>
        )}
      </dl>

      <UnitMaintenance
        unitId={unit.id}
        economicNumber={unit.economicNumber}
        isBox={!hasOdometer}
        currentKm={mileage.last?.km ?? null}
        items={maintenance}
        sources={maintenanceSources}
        // Una unidad de baja o vendida ya no se programa; lo que tenía se sigue viendo.
        canEdit={isAdmin && !isRetired(unit.status)}
        canRegister={isAdmin && !isRetired(unit.status)}
        today={todayInTijuana()}
      />

      <ShopStays
        // key: al actualizar la pantalla (router.refresh) la lista empieza de nuevo con los datos frescos.
        key={`${shopStays.total}|${shopStays.stays.map((s) => `${s.id}:${s.total}:${s.exitDate}`).join(",")}`}
        unitId={unit.id}
        initialStays={shopStays.stays}
        total={shopStays.total}
        batchSize={SHOP_STAYS_BATCH_SIZE}
        today={todayInTijuana()}
      />

      <h2 className="mb-4 text-2xl font-semibold">Gastos</h2>
      <ServiceFilters unitSearch={false} />
      <Suspense fallback={<ExpenseListSkeleton />}>
        <ExpenseList filters={filters} unitId={unit.id} />
      </Suspense>

      {isAdmin && unit.status !== "vendida" && (
        <SellUnitZone
          unitId={unit.id}
          economicNumber={unit.economicNumber}
          inShop={unit.status === "en_taller"}
          today={todayInTijuana()}
        />
      )}

      {isAdmin && (
        <DeleteUnitZone
          unitId={unit.id}
          economicNumber={unit.economicNumber}
          serviceCount={totals.serviceCount}
          expenseCount={totals.expenseCount}
          totalLabel={formatMoney(totals.total)}
          afterDeleteHref={group === "local" ? "/unidades" : `/unidades?grupo=${group}`}
        />
      )}
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
