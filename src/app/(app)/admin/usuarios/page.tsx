import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { UsersView } from "@/features/usuarios/components/users-view";
import { listUsers } from "@/features/usuarios/queries";
import { requireRole } from "@/lib/auth/get-current-user";

export const metadata: Metadata = { title: "Usuarios" };

async function Users() {
  const user = await requireRole("admin");
  const users = await listUsers();
  return <UsersView users={users} currentUserId={user.id} />;
}

function UsersSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando usuarios">
      <div className="mb-4 h-11 w-80 max-w-full animate-pulse rounded-md bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

export default function UsuariosPage() {
  return (
    <>
      <PageHeader title="Usuarios" description="Personas con acceso al sistema y su rol." />
      <Suspense fallback={<UsersSkeleton />}>
        <Users />
      </Suspense>
    </>
  );
}
