// Lectura directa de la base (PostgREST) con la sesión del admin [PRUEBA K6],
// para comprobar lo que la pantalla dice que guardó (5L, D26). Solo lectura.

import http from "k6/http";

import { login } from "../lib/sesion.js";
import { env } from "./lib.js";

let token = null;

function headers() {
  if (!token) token = login(env, "admin").token;
  return { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` };
}

export function get(path) {
  const res = http.get(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: headers(), tags: { name: "api" } });
  if (res.status !== 200) throw new Error(`API ${path}: ${res.status} ${res.body}`);
  return res.json();
}

export function one(path) {
  const rows = get(path);
  return rows.length ? rows[0] : null;
}

export function unitId(number) {
  const u = one(`unidades?select=id&numero_economico=eq.${encodeURIComponent(number)}`);
  if (!u) throw new Error(`No existe la unidad ${number}`);
  return u.id;
}

/** "1234.56" -> 123456 centavos (sin pasar por float). */
export function toCents(value) {
  const [whole, frac = ""] = String(value).split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(parseInt(whole, 10)) * 100 + parseInt((frac + "00").slice(0, 2), 10));
}

/**
 * Pesos de un gasto en dólares, como la BD: round(monto_usd * tipo_cambio, 2),
 * redondeo a la mitad hacia arriba. usd en centavos, rate como texto "17.2345".
 */
export function usdToMxnCents(usdCents, rate) {
  const [w, f = ""] = rate.split(".");
  const rate10k = parseInt(w, 10) * 10000 + parseInt((f + "0000").slice(0, 4), 10);
  const micro = usdCents * rate10k; // centavos * 10^4
  return Math.floor((micro + 5000) / 10000);
}

/** Llama una función de la BD (rpc) con la sesión del admin; regresa el JSON. */
export function rpc(name, body) {
  const res = http.post(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, JSON.stringify(body || {}), {
    headers: { ...headers(), "Content-Type": "application/json" },
    tags: { name: "api" },
  });
  if (res.status !== 200) throw new Error(`RPC ${name}: ${res.status} ${res.body}`);
  return res.json();
}
