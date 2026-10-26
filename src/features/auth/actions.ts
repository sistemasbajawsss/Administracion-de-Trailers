"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getSessionUser } from "@/lib/auth/get-current-user";
import { requiresMfa } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

import { loginSchema, totpCodeSchema } from "./schemas";

/** Nombre con el que aparece la cuenta en la app autenticadora. */
const TOTP_ISSUER = "Flotilla BWS";

export async function signIn(input: unknown): Promise<ActionResult> {
  // 1. Validar entrada (aunque el cliente ya lo haya hecho).
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Revisa el correo y la contraseña.");
  }

  // 2. Sin requireRole: esta acción es la que crea la sesión.
  // 3. Operación en Supabase.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return fail("Correo o contraseña incorrectos.");
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("activo")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!perfil?.activo) {
    await supabase.auth.signOut();
    return fail("Tu usuario está desactivado. Pide al administrador que lo reactive.");
  }

  // 4. Revalidar todo el layout: cambia la navegación según el rol.
  revalidatePath("/", "layout");

  // 5. Resultado.
  return ok();
}

/**
 * Cierra la sesión. No redirige desde el servidor: el cliente hace una
 * navegación completa a /login para borrar de memoria las páginas que se
 * vieron con la sesión anterior (y el formulario de login empieza vacío).
 */
export async function signOut(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return fail("No se pudo cerrar la sesión. Inténtalo de nuevo.");
  revalidatePath("/", "layout");
  return ok();
}

// ---------------------------------------------------------------------------
// Verificación en dos pasos (D6)
// ---------------------------------------------------------------------------

export type TotpEnrollment = {
  /** Código QR como imagen SVG (data URI) para escanear con la app. */
  qrCode: string;
  /** La misma clave en texto, por si la cámara no puede leer el QR. */
  secret: string;
};

/**
 * Empieza el alta de la app autenticadora: genera la clave y su código QR.
 * Si quedó un alta a medias, la reemplaza. No sirve si ya hay una app dada de alta:
 * cambiarla requiere que un admin quite la anterior (ver docs/ESTADO.md).
 */
export async function startTotpEnrollment(): Promise<ActionResult<TotpEnrollment>> {
  // 1. Sin entrada que validar.
  // 2. Sesión con contraseña; el rol debe usar segundo paso.
  const user = await getSessionUser();
  if (!requiresMfa(user.role)) return fail("Tu usuario no usa verificación en dos pasos.");

  // 3. Operación en Supabase.
  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return fail("No se pudo preparar la verificación. Inténtalo de nuevo.");
  if (factors.totp.length > 0) {
    return fail("Ya tienes una app autenticadora. Escribe el código que muestra.");
  }

  for (const factor of factors.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: TOTP_ISSUER,
    friendlyName: "App autenticadora",
  });
  if (error) return fail("No se pudo generar el código QR. Inténtalo de nuevo.");

  // 4. Nada que revalidar todavía: el alta termina al verificar el primer código.
  // 5. Resultado.
  return ok({ qrCode: data.totp.qr_code, secret: data.totp.secret });
}

/**
 * Revisa el código de 6 dígitos. Si es correcto, la sesión sube a aal2 (cookies
 * nuevas) y el usuario ya tiene su rol en la app y en la base de datos.
 * Sirve para terminar el alta y para cada inicio de sesión. El factor se busca
 * aquí, no se recibe del navegador.
 */
export async function verifyTotp(input: unknown): Promise<ActionResult> {
  // 1. Validar entrada.
  const parsed = totpCodeSchema.safeParse(input);
  if (!parsed.success) return fail("Escribe los 6 dígitos que muestra la app.");

  // 2. Sesión con contraseña; el rol debe usar segundo paso.
  const user = await getSessionUser();
  if (!requiresMfa(user.role)) return fail("Tu usuario no usa verificación en dos pasos.");

  // 3. Operación en Supabase.
  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return fail("No se pudo revisar el código. Inténtalo de nuevo.");

  const factor =
    factors.totp[0] ??
    factors.all.find((f) => f.factor_type === "totp" && f.status === "unverified");
  if (!factor) return fail("Primero escanea el código QR con tu app autenticadora.");

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data.code,
  });
  if (error) {
    return fail("Código incorrecto o vencido. Escribe el que aparece ahora en la app.");
  }

  // 4. Revalidar todo el layout: ahora sí tiene rol.
  revalidatePath("/", "layout");

  // 5. Resultado.
  return ok();
}
