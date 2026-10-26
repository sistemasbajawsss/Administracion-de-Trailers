import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";
import { ReportFilters } from "@/features/dashboard/components/report-filters";
import { ReportView, ReportViewSkeleton } from "@/features/dashboard/components/report-view";
import { reportFiltersSchema, resolvePeriod } from "@/features/dashboard/schemas";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";
import { todayInTijuana } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Reportes" };

async function Report({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const filters = reportFiltersSchema.parse(await searchParams);
  const period = resolvePeriod(filters, todayInTijuana());

  return (
    <>
      <ReportFilters from={period.from} to={period.to} />
      <Suspense key={JSON.stringify({ period, g: filters.grupo, t: filters.tipo })} fallback={<ReportViewSkeleton />}>
        <ReportView period={period} filters={filters} />
      </Suspense>
    </>
  );
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <RequireRole role={VIEW_ALL_ROLES}>
      <PageHeader title="Reportes" description="Cuánto se invierte, en qué, en cuáles unidades y cuándo." />
      <Suspense fallback={<ReportViewSkeleton />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </RequireRole>
  );
}
