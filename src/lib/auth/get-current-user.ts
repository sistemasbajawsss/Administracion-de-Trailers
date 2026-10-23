import "server-only";

import { redirect } from "next/navigation";

import { isMockAuthEnabled } from "@/lib/env";
import { getMockUser } from "@/mock/session";

import type { CurrentUser, Role } from "./types";

/**
 * Único punto de lectura del usuario actual (Data Access Layer).
 * Sección 0A: devuelve el usuario simulado. En 0B lee la sesión de Supabase
 * y el rol desde la tabla perfiles.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  if (isMockAuthEnabled()) {
    return getMockUser();
  }

  // Pendiente 0B: supabase.auth.getClaims() + consulta a perfiles.
  redirect("/login");
}

/**
 * Exige un rol en el servidor; si no lo tiene, regresa al inicio.
 * Ocultar enlaces en la navegación no basta.
 */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user.role !== role) {
    redirect("/");
  }
  return user;
}
