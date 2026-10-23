"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

import { loginSchema } from "./schemas";

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

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
