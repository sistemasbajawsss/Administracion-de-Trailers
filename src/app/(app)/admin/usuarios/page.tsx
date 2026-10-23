import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RequireRole } from "@/features/auth/components/require-role";

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
