import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { getSupabaseEnv } from "@/lib/env";

import { SESSION_COOKIE_OPTIONS } from "./cookie-options";
import type { Database } from "./database.types";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Crear uno nuevo por petición; nunca reutilizarlo entre peticiones.
 *
 * connection(): los datos de Supabase siempre se leen al momento de la petición.
 * Sin esto, el prefetch parcial intenta prerenderizar con las cookies y choca con
 * el Date.now() que usa getClaims() para revisar si el token expiró.
 */
export async function createClient() {
  await connection();
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component: no puede escribir cookies.
          // El proxy se encarga de refrescar la sesión.
        }
      },
    },
  });
}
