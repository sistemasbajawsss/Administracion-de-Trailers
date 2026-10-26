export const ROLES = ["admin", "capturista", "gerente"] as const;

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
  gerente: "Gerente",
};

/** Registran y editan servicios (el capturista solo los suyos). */
export const CAPTURE_ROLES = ["admin", "capturista"] as const satisfies readonly Role[];

/** Ven todas las unidades, servicios e historial. El gerente solo lee. */
export const VIEW_ALL_ROLES = ["admin", "gerente"] as const satisfies readonly Role[];
