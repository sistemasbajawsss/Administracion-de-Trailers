import type { Metadata } from "next";
import { Suspense } from "react";

import { BackButton } from "@/components/shared/back-button";
import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";
import { DeletedServiceList } from "@/features/servicios/components/deleted-service-list";
import { ExpenseListSkeleton } from "@/features/servicios/components/expense-list";

export const metadata: Metadata = { title: "Servicios eliminados" };

export default function ServiciosEliminadosPage() {
  return (
    <RequireRole role="admin">
      <BackButton fallback="/servicios" className="mb-4" />
      <PageHeader
        title="Servicios eliminados"
        description="Cada servicio se puede restaurar tal como estaba, con sus gastos y a nombre de quien lo capturó."
      />
      <Suspense fallback={<ExpenseListSkeleton />}>
        <DeletedServiceList />
      </Suspense>
    </RequireRole>
  );
}
