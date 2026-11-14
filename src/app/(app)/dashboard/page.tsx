import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";
import { MonthClosePanel } from "@/features/cierres/components/month-close-panel";
import { getMonthLock, listMonthCloses } from "@/features/cierres/queries";
import { ReportFilters } from "@/features/dashboard/components/report-filters";
import { ReportView, ReportViewSkeleton } from "@/features/dashboard/components/report-view";
import { listReportUnitTypes } from "@/features/dashboard/queries";
import { reportFiltersSchema, resolvePeriod } from "@/features/dashboard/schemas";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";
import { todayInTijuana } from "@/lib/utils/format";
import { openMonthsNote } from "@/lib/utils/month-lock";

export const metadata: Metadata = { title: "Reportes" };

async function Report({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const [params, unitTypes, lock] = await Promise.all([searchParams, listReportUnitTypes(), getMonthLock()]);
  const filters = reportFiltersSchema.parse(params);
  const period = resolvePeriod(filters, todayInTijuana());

  return (
    <>
      <ReportFilters from={period.from} to={period.to} unitTypes={unitTypes} />
      <Suspense key={JSON.stringify({ period, g: filters.grupo, t: filters.tipo })} fallback={<ReportViewSkeleton />}>
        {/* Cierre de mes (5I): qué meses del periodo todavía pueden cambiar. */}
        <ReportView period={period} filters={filters} monthNote={openMonthsNote(period.from, period.to, lock)} />
      </Suspense>
    </>
  );
}

/** Cierre de mes (5I, D17): el admin cierra y reabre; el gerente solo ve. */
async function MonthClose() {
  const [user, months, lock] = await Promise.all([getCurrentUser(), listMonthCloses(), getMonthLock()]);
  return <MonthClosePanel months={months} closeDay={lock.closeDay} canManage={user.role === "admin"} />;
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <RequireRole role={VIEW_ALL_ROLES}>
      <div className="print:hidden">
        <PageHeader title="Reportes" description="Cuánto se invierte, en qué, en cuáles unidades y cuándo." />
      </div>
      <Suspense fallback={<ReportViewSkeleton />}>
        <Report searchParams={searchParams} />
      </Suspense>
      <div className="mt-6 print:hidden">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
          <MonthClose />
        </Suspense>
      </div>
    </RequireRole>
  );
}
