import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { UserListItem } from "./types";

/** Usuarios con correo y último acceso (listar_usuarios revisa que sea admin). */
export async function listUsers(): Promise<UserListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listar_usuarios");
  if (error) throw new Error("No se pudieron cargar los usuarios");

  return data.map((row) => ({
    id: row.id,
    name: row.nombre,
    email: row.correo,
    role: row.rol,
    active: row.activo,
    createdAt: row.created_at,
    lastSignInAt: row.ultimo_acceso,
  }));
}
