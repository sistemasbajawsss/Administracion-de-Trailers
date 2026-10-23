// DATOS DE EJEMPLO — Sección 0A. Borrar toda la carpeta src/lib/mock/ en 0B.
import "server-only";

import { ROLES, type CurrentUser, type Role } from "@/lib/auth/types";

const MOCK_USERS: Record<Role, CurrentUser> = {
  admin: {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Admin de prueba",
    email: "admin@ejemplo.test",
    role: "admin",
  },
  capturista: {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Capturista de prueba",
    email: "capturista@ejemplo.test",
    role: "capturista",
  },
};

export function getMockUser(): CurrentUser {
  const role = ROLES.find((r) => r === process.env.MOCK_ROLE) ?? "admin";
  return MOCK_USERS[role];
}
