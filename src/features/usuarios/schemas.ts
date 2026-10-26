import { z } from "zod";

import { ROLES } from "@/lib/auth/types";

/**
 * Contraseña: 12 o más caracteres con minúscula, mayúscula, número y símbolo
 * (la misma política que se recomienda activar en Supabase Auth).
 */
export const passwordSchema = z
  .string()
  .min(12, "Mínimo 12 caracteres")
  .max(72, "Máximo 72 caracteres")
  .regex(/[a-z]/, "Incluye al menos una minúscula")
  .regex(/[A-Z]/, "Incluye al menos una mayúscula")
  .regex(/\d/, "Incluye al menos un número")
  .regex(/[^A-Za-z0-9]/, "Incluye al menos un símbolo (por ejemplo ! # $ %)");

const nameSchema = z.string().trim().min(2, "Escribe el nombre").max(80, "Máximo 80 caracteres");
const roleSchema = z.enum(ROLES, "Elige el rol");

export const createUserSchema = z.object({
  name: nameSchema,
  email: z.string().trim().toLowerCase().pipe(z.email("Correo no válido")),
  role: roleSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: nameSchema,
  role: roleSchema,
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!#$%&*+-=?@";

/**
 * Contraseña aleatoria que cumple la política, sin letras que se confundan al
 * dictarla (l, I, O, 0, 1). Usa crypto.getRandomValues (navegador y servidor).
 */
export function generatePassword(length = 14): string {
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0]! % chars.length]!;
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  // Mezcla (Fisher-Yates) para que los obligatorios no queden siempre al inicio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
