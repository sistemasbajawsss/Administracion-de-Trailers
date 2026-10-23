import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";

export const metadata: Metadata = { title: "Unidades" };

export default function UnidadesPage() {
  return (
    <RequireRole role="admin">
      <PageHeader
        title="Unidades"
        description="Trailers, camiones rabones y camionetas de la flotilla, por número económico."
      />
      <EmptyState
        title="Todavía no hay unidades registradas"
        description="El alta de unidades estará disponible en la siguiente etapa."
      />
    </RequireRole>
  );
}
