import { Suspense, type ReactNode } from "react";

import { requireRole } from "@/lib/auth/get-current-user";
import type { Role } from "@/lib/auth/types";

type Allowed = Role | readonly Role[];

async function RoleGuard({ role, children }: { role: Allowed; children: ReactNode }) {
  await requireRole(role);
  return children;
}

/**
 * Protege el contenido de una página en el servidor según el rol (o roles).
 */
export function RequireRole({ role, children }: { role: Allowed; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RoleGuard role={role}>{children}</RoleGuard>
    </Suspense>
  );
}
