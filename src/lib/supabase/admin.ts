import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Cliente con la llave service_role: se salta RLS y puede usar la Auth Admin API
 * (crear usuarios, cambiar contraseñas). SOLO en el servidor y solo después de
 * requireRole("admin"). La llave nunca lleva prefijo NEXT_PUBLIC_ ni sale al navegador.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (o en Vercel)");
  }
  const { url } = getSupabaseEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
