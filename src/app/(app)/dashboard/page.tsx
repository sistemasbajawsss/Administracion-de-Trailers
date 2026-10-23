import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";

export const metadata: Metadata = { title: "Reportes" };

export default function DashboardPage() {
  return (
    <RequireRole role={VIEW_ALL_ROLES}>
      <PageHeader title="Reportes" description="Inversión por camión, categoría, proveedor y periodo." />
      <EmptyState
        title="Sin datos para reportar"
        description="Los reportes se llenan a partir de los servicios y gastos capturados."
      />
    </RequireRole>
  );
}
