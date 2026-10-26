import type { Role } from "@/lib/auth/types";

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};
