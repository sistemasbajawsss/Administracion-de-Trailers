import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Escribe tu correo")
    .pipe(z.email("Correo no válido")),
  password: z.string().min(1, "Escribe tu contraseña"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Escribe los 6 dígitos que muestra la app"),
});

export type TotpCodeInput = z.infer<typeof totpCodeSchema>;
