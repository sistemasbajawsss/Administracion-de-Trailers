import "server-only";

import { createClient } from "@/lib/supabase/server";

export type MfaFactorState =
  | { kind: "enroll" }
  | { kind: "verify"; factorId: string };

/**
 * ¿El usuario ya dio de alta su app autenticadora? Solo cuenta un factor TOTP
 * verificado; los que se quedaron a medias se reemplazan al volver a empezar.
 */
export async function getMfaFactorState(): Promise<MfaFactorState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error("No se pudo revisar la verificación en dos pasos");

  const verified = data.totp[0];
  return verified ? { kind: "verify", factorId: verified.id } : { kind: "enroll" };
}
