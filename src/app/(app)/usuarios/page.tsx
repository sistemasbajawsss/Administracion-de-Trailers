import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/app-shell/page-header";
import { RequireRole } from "@/components/app-shell/require-role";

export const metadata: Metadata = { title: "Usuarios" };

export default function UsuariosPage() {
  return (
    <RequireRole role="admin">
      <PageHeader title="Usuarios" description="Personas con acceso al sistema y su rol." />
      <EmptyState
        title="Gestión de usuarios pendiente"
        description="Por ahora los usuarios se crean directamente en Supabase."
      />
    </RequireRole>
  );
}
