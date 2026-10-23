import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";

export const metadata: Metadata = { title: "Camiones" };

export default function UnidadesPage() {
  return (
    <RequireRole role="admin">
      <PageHeader title="Camiones" description="Unidades de la flotilla por número económico." />
      <EmptyState
        title="Todavía no hay camiones registrados"
        description="El alta de camiones estará disponible en la siguiente etapa."
      />
    </RequireRole>
  );
}
