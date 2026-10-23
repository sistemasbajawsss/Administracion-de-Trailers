import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";

export const metadata: Metadata = { title: "Servicios" };

export default function ServiciosPage() {
  return (
    <RequireRole role="admin">
      <PageHeader title="Servicios" description="Reparaciones y mantenimientos de todas las unidades." />
      <EmptyState
        title="Todavía no hay servicios registrados"
        description="Los servicios capturados aparecerán aquí con su total y comprobantes."
      />
    </RequireRole>
  );
}
