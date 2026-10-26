"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { createUserSchema, resetPasswordSchema, updateUserSchema } from "./schemas";

const idSchema = z.uuid();

/** Mensajes de la BD pensados para el usuario (protección de admins: 23514). */
function dbMessage(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "23514" && error.message && !error.message.includes("violates")) return error.message;
  if (error.code === "42501") return "Solo un administrador puede hacer esto.";
  return fallback;
}

/** Mensajes de la Auth Admin API. */
function authMessage(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "email_exists" || error.message?.includes("already been registered")) {
    return "Ya existe un usuario con ese correo.";
  }
  if (error.code === "weak_password") return "La contraseña no cumple la política de Supabase. Usa una más larga o generada.";
  return fallback;
}

/**
 * Alta de usuario con contraseña inicial (sin correo de invitación). El trigger
 * al_crear_usuario crea su perfil con el nombre y el rol (el rol va en
 * app_metadata, que el usuario no puede modificar).
 */
export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos del usuario.");

  await requireRole("admin");

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return fail("Falta configurar la llave del servidor (SUPABASE_SERVICE_ROLE_KEY).");
  }

  const { name, email, role, password } = parsed.data;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: name },
    app_metadata: { rol: role },
  });
  if (error || !data.user) return fail(authMessage(error ?? {}, "No se pudo crear el usuario. Inténtalo de nuevo."));

  revalidatePath("/admin/usuarios");
  return ok({ id: data.user.id });
}

/** Cambia nombre y rol. RLS (solo admin) y el trigger de protección de admins aplican. */
export async function updateUser(id: string, input: unknown): Promise<ActionResult> {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success || !idSchema.safeParse(id).success) {
    return fail(parsed.error?.issues[0]?.message ?? "Revisa los datos del usuario.");
  }

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("perfiles")
    .update({ nombre: parsed.data.name, rol: parsed.data.role })
    .eq("id", id)
    .select("id");
  if (error) return fail(dbMessage(error, "No se pudieron guardar los cambios."));
  if (!data.length) return fail("No se encontró el usuario.");

  revalidatePath("/admin/usuarios");
  return ok();
}

/**
 * Desactiva o reactiva. Un usuario desactivado no puede entrar y, aunque tenga la
 * sesión abierta, la BD ya no le reconoce rol (no ve ni escribe nada).
 */
export async function setUserActive(id: string, active: boolean): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success || typeof active !== "boolean") return fail("Usuario no válido.");

  await requireRole("admin");

  const supabase = await createClient();
  const { data, error } = await supabase.from("perfiles").update({ activo: active }).eq("id", id).select("id");
  if (error) return fail(dbMessage(error, "No se pudo cambiar el estado del usuario."));
  if (!data.length) return fail("No se encontró el usuario.");

  revalidatePath("/admin/usuarios");
  return ok();
}

/** Pone una contraseña nueva (el admin se la pasa a la persona). */
export async function resetUserPassword(id: string, input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success || !idSchema.safeParse(id).success) {
    return fail(parsed.error?.issues[0]?.message ?? "Revisa la contraseña.");
  }

  await requireRole("admin");

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return fail("Falta configurar la llave del servidor (SUPABASE_SERVICE_ROLE_KEY).");
  }

  const { error } = await admin.auth.admin.updateUserById(id, { password: parsed.data.password });
  if (error) return fail(authMessage(error, "No se pudo cambiar la contraseña. Inténtalo de nuevo."));

  return ok();
}
