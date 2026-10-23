import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/app-shell/page-header";
import { RequireRole } from "@/components/app-shell/require-role";

export const metadata: Metadata = { title: "Camiones" };

export default function CamionesPage() {
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
