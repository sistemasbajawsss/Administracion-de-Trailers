import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { requiresMfa, type CurrentUser, type Role } from "./types";

export type SessionUser = CurrentUser & {
  /** La sesión ya pasó el segundo paso (aal2 en el JWT). */
  mfaVerified: boolean;
};

/**
 * Usuario con sesión, haya pasado o no el segundo paso. Solo para /verificacion;
 * el resto de la app usa getCurrentUser().
 * Valida el JWT con getClaims() y toma nombre y rol de la tabla perfiles.
 * Sin sesión → /login. Perfil desactivado → /login?motivo=inactivo.
 * cache() evita repetir la consulta dentro de la misma petición.
 */
export const getSessionUser = cache(async (): Promise<SessionUser> => {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (claimsError || !claims?.sub) {
    redirect("/login");
  }

  const { data: perfil, error } = await supabase
    .from("perfiles")
    .select("id, nombre, rol, activo")
    .eq("id", claims.sub)
    .maybeSingle();

  if (error || !perfil) {
    redirect("/login");
  }
  if (!perfil.activo) {
    redirect("/login?motivo=inactivo");
  }

  return {
    id: perfil.id,
    name: perfil.nombre,
    email: typeof claims.email === "string" ? claims.email : "",
    role: perfil.rol,
    mfaVerified: claims.aal === "aal2",
  };
});

/**
 * Único punto de lectura del usuario actual (Data Access Layer).
 * Admin y gerente sin el segundo paso → /verificacion (D6). La base de datos
 * tampoco les reconoce el rol hasta entonces.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const { mfaVerified, ...user } = await getSessionUser();
  if (requiresMfa(user.role) && !mfaVerified) {
    redirect("/verificacion");
  }
  return user;
});

/**
 * Exige un rol (o uno de varios) en el servidor; si no lo tiene, regresa al inicio.
 * Ocultar enlaces en la navegación no basta.
 */
export async function requireRole(role: Role | readonly Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const allowed: readonly Role[] = typeof role === "string" ? [role] : role;
  if (!allowed.includes(user.role)) {
    redirect("/");
  }
  return user;
}
