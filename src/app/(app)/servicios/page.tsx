import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/app-shell/page-header";
import { RequireRole } from "@/components/app-shell/require-role";

export const metadata: Metadata = { title: "Servicios" };

export default function ServiciosPage() {
  return (
    <RequireRole role="admin">
      <PageHeader title="Servicios" description="Reparaciones y mantenimientos de todos los camiones." />
      <EmptyState
        title="Todavía no hay servicios registrados"
        description="Los servicios capturados aparecerán aquí con su total y comprobantes."
      />
    </RequireRole>
  );
}
