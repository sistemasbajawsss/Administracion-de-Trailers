import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import type { CurrentUser, Role } from "./types";

/**
 * Único punto de lectura del usuario actual (Data Access Layer).
 * Valida el JWT con getClaims() y toma nombre y rol de la tabla perfiles.
 * Sin sesión → /login. Perfil desactivado → /login?motivo=inactivo.
 * cache() evita repetir la consulta dentro de la misma petición.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
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
  };
});

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
