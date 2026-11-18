// Sesión de Supabase para k6 (5K).
//
// Cada cuenta [PRUEBA K6] inicia sesión UNA vez (en setup) con la API de Auth y
// los usuarios simulados de su rol comparten esa sesión: así no se dispara el
// límite de intentos de inicio de sesión. La cookie se arma igual que
// @supabase/ssr: sb-<ref>-auth-token = "base64-" + base64url(JSON de la sesión),
// partida en .0, .1... si pasa de 3180 caracteres.
//
// La sesión dura una hora: cada corrida debe durar menos (el proxy la renovaría
// y, al compartirla, la renovación de un usuario invalidaría la de los demás).

import http from "k6/http";
import encoding from "k6/encoding";

const CHUNK = 3180;

export function readEnv(text) {
  const out = {};
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Inicia sesión y regresa el encabezado Cookie listo para la app. */
export function login(env, role) {
  const key = role.toUpperCase();
  const res = http.post(
    `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: env[`K6_${key}_EMAIL`], password: env[`K6_${key}_PASSWORD`] }),
    { headers: { "Content-Type": "application/json", apikey: env.SUPABASE_PUBLISHABLE_KEY }, tags: { name: "login" } },
  );
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión como ${role}: ${res.status} ${res.body}`);

  const ref = env.SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = `base64-${encoding.b64encode(res.body, "rawurl")}`;
  if (value.length <= CHUNK) return { cookie: `${name}=${value}`, token: res.json("access_token") };

  const parts = [];
  for (let i = 0; i * CHUNK < value.length; i++) parts.push(`${name}.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return { cookie: parts.join("; "), token: res.json("access_token") };
}
