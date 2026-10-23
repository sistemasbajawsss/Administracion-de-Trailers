import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/app-shell/page-header";
import { RequireRole } from "@/components/app-shell/require-role";

export const metadata: Metadata = { title: "Reportes" };

export default function ReportesPage() {
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
