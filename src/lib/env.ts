import { z } from "zod";

const supabaseEnvSchema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
});

export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;

/**
 * Lee y valida las variables públicas de Supabase.
 * Las referencias a process.env.NEXT_PUBLIC_* deben ser literales para que
 * Next.js las incluya en el bundle del cliente.
 */
export function getSupabaseEnv(): SupabaseEnv {
  const result = supabaseEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local",
    );
  }

  return result.data;
}

/**
 * Modo simulado de la Sección 0A. Nunca se permite en producción de Vercel.
 */
export function isMockAuthEnabled(): boolean {
  const enabled = process.env.USE_MOCK_AUTH === "1";

  if (enabled && process.env.VERCEL_ENV === "production") {
    throw new Error("USE_MOCK_AUTH no puede estar activo en producción");
  }

  return enabled;
}
