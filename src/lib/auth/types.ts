export const ROLES = ["admin", "capturista"] as const;

export type Role = (typeof ROLES)[number];

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  capturista: "Capturista",
};
