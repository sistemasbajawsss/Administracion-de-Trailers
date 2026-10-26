import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Cookies de sesión que ningún script del navegador puede leer (httpOnly):
 * aunque se colara un script ajeno, no podría robar el token. La app solo usa
 * Supabase desde el servidor; la subida de comprobantes usa URLs firmadas,
 * que no necesitan la sesión en el navegador.
 * secure: solo viajan por HTTPS (en desarrollo local se usa http://localhost).
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
