import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";

export const metadata: Metadata = { title: "Reportes" };

export default function DashboardPage() {
  return (
    <RequireRole role="admin">
      <PageHeader title="Reportes" description="Inversión por camión, categoría, proveedor y periodo." />
      <EmptyState
        title="Sin datos para reportar"
        description="Los reportes se llenan a partir de los servicios y gastos capturados."
      />
    </RequireRole>
  );
}
