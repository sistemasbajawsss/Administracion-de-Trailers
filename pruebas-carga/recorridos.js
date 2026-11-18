// Prueba de carga (5K): usuarios simulados que recorren la app como sus roles.
// Solo lectura: abren pantallas, no guardan nada.
//
//   Con medir.ps1 (recomendado: además mide el procesador de la app):
//     powershell -File pruebas-carga/medir.ps1 -Usuarios 20
//   Directo:
//     k6 run -e USUARIOS=20 -e DURACION=8m pruebas-carga/recorridos.js
//
// Variables:
//   USUARIOS  total de usuarios simulados (70 % capturistas, 20 % admin, 10 % gerente). Por omisión 5.
//   DURACION  cuánto dura la corrida (menos de 50 min: la sesión compartida dura 1 h). Por omisión 8m.
//   PAGINA    aísla una pantalla: todos los usuarios piden solo esa, cada segundo (para medir su procesador).
//   BASE_URL  la app en modo producción. Por omisión http://localhost:3100.
//
// Las pantallas se piden como lo hace el navegador al moverse dentro de la app
// (encabezado RSC: 1, la respuesta es el contenido de la pantalla, sin el HTML de
// la carga inicial). El Excel es una descarga normal.

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

import { login, readEnv } from "./lib/sesion.js";

const env = readEnv(open("./.env.k6"));
const BASE = __ENV.BASE_URL || "http://localhost:3100";
const TOTAL = Math.max(1, Number(__ENV.USUARIOS || 5));
const DURATION = __ENV.DURACION || "8m";
const ONLY = __ENV.PAGINA || "";

// Cada pantalla: qué rol la abre y su dirección (unidad / servicio se eligen al azar).
const PAGES = {
  inicio_capturista: { role: "capturista", path: () => "/" },
  servicios_capturista: { role: "capturista", path: () => "/servicios" },
  ficha_unidad: { role: "capturista", path: (d) => `/unidades/${pick(d.units)}` },
  servicio_nuevo: { role: "capturista", path: () => "/servicios/nuevo" },
  kilometraje: { role: "capturista", path: () => "/kilometraje" },
  mantenimientos_capturista: { role: "capturista", path: () => "/mantenimientos" },
  inicio_admin: { role: "admin", path: () => "/" },
  mantenimientos: { role: "admin", path: () => "/mantenimientos" },
  taller: { role: "admin", path: () => "/taller" },
  tickets: { role: "admin", path: () => "/tickets" },
  servicios_admin: { role: "admin", path: () => "/servicios" },
  detalle_servicio: { role: "admin", path: (d) => `/servicios/${pick(d.services)}` },
  reportes_admin: { role: "admin", path: () => "/dashboard" },
  inicio_gerente: { role: "gerente", path: () => "/" },
  reportes_gerente: { role: "gerente", path: () => "/dashboard" },
  excel: { role: "gerente", path: () => "/dashboard/exportar?periodo=12m", download: true },
  ficha_unidad_gerente: { role: "gerente", path: (d) => `/unidades/${pick(d.units)}` },
};

// Recorrido de cada rol, en orden; se repite hasta que termina la corrida.
const ROUTES = {
  capturista: ["inicio_capturista", "servicio_nuevo", "servicios_capturista", "ficha_unidad", "kilometraje", "mantenimientos_capturista"],
  admin: ["inicio_admin", "mantenimientos", "taller", "tickets", "servicios_admin", "detalle_servicio", "reportes_admin"],
  gerente: ["inicio_gerente", "reportes_gerente", "excel", "ficha_unidad_gerente"],
};

const trends = {};
for (const name of Object.keys(PAGES)) trends[name] = new Trend(`p_${name}`, true);
const errors = new Rate("errores");
const appRequests = new Counter("peticiones_app");

function split(total) {
  if (ONLY) return { [PAGES[ONLY].role]: total };
  const admin = Math.max(1, Math.round(total * 0.2));
  const gerente = total >= 3 ? Math.max(1, Math.round(total * 0.1)) : 0;
  return { capturista: Math.max(1, total - admin - gerente), admin, gerente };
}

const scenarios = {};
for (const [role, vus] of Object.entries(split(TOTAL))) {
  if (vus > 0) scenarios[role] = { executor: "constant-vus", vus, duration: DURATION, exec: "run", env: { ROL: role } };
}
if (ONLY && !PAGES[ONLY]) throw new Error(`PAGINA desconocida: ${ONLY}. Opciones: ${Object.keys(PAGES).join(", ")}`);

export const options = { scenarios, setupTimeout: "60s", summaryTrendStats: ["med", "p(95)", "max", "count"] };

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function setup() {
  const sessions = {};
  for (const role of ["admin", "capturista", "gerente"]) sessions[role] = login(env, role);

  // Unidades y servicios reales para las fichas y el detalle (con la sesión del admin).
  const rest = (q) =>
    http.get(`${env.SUPABASE_URL}/rest/v1/${q}`, {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${sessions.admin.token}` },
      tags: { name: "setup" },
    }).json();
  const units = rest("unidades?select=id&limit=100").map((r) => r.id);
  const services = rest("servicios?select=id&order=fecha.desc&limit=200").map((r) => r.id);
  if (units.length === 0 || services.length === 0) throw new Error("No hay unidades o servicios para la prueba");
  return { cookies: Object.fromEntries(Object.entries(sessions).map(([r, s]) => [r, s.cookie])), units, services };
}

function open_(name, data) {
  const page = PAGES[name];
  const headers = { Cookie: data.cookies[page.role] };
  let path = page.path(data);
  if (!page.download) {
    // Como el navegador al moverse por la app: RSC: 1 y el parámetro _rsc
    // (sin él, Next responde con una redirección hacia la misma dirección con _rsc).
    headers.RSC = "1";
    path += `${path.includes("?") ? "&" : "?"}_rsc=`;
  }
  const res = http.get(`${BASE}${path}`, { headers, redirects: 0, tags: { name }, timeout: "60s" });
  appRequests.add(1);
  const ok = check(res, { [`${name}: 200`]: (r) => r.status === 200 });
  errors.add(!ok, { name });
  if (ok) trends[name].add(res.timings.duration);
}

export function run(data) {
  if (ONLY) {
    open_(ONLY, data);
    sleep(1);
    return;
  }
  for (const name of ROUTES[__ENV.ROL]) {
    open_(name, data);
    sleep(5 + Math.random() * 10); // una persona lee la pantalla de 5 a 15 s
  }
}

export function handleSummary(data) {
  const rows = [];
  for (const name of Object.keys(PAGES)) {
    const m = data.metrics[`p_${name}`];
    if (!m || !m.values.count) continue;
    rows.push({ pantalla: name, veces: m.values.count, tipica_ms: Math.round(m.values.med), lenta_p95_ms: Math.round(m.values["p(95)"]), max_ms: Math.round(m.values.max) });
  }
  rows.sort((a, b) => b.tipica_ms - a.tipica_ms);
  const err = data.metrics.errores ? data.metrics.errores.values.rate : 0;
  const total = data.metrics.peticiones_app ? data.metrics.peticiones_app.values.count : 0;

  const pad = (s, n) => String(s).padEnd(n);
  const lines = [
    "",
    `Usuarios: ${TOTAL}${ONLY ? ` (solo ${ONLY})` : ""}   Duración: ${DURATION}   Peticiones a la app: ${total}   Errores: ${(err * 100).toFixed(2)} %`,
    "",
    `${pad("Pantalla", 28)}${pad("Veces", 8)}${pad("Típica ms", 12)}${pad("5% lento ms", 14)}Máx ms`,
    ...rows.map((r) => `${pad(r.pantalla, 28)}${pad(r.veces, 8)}${pad(r.tipica_ms, 12)}${pad(r.lenta_p95_ms, 14)}${r.max_ms}`),
    "",
  ];
  const out = { "stdout": lines.join("\n") };
  if (__ENV.SALIDA) out[__ENV.SALIDA] = JSON.stringify({ usuarios: TOTAL, duracion: DURATION, pagina: ONLY || null, peticiones: total, errores: err, pantallas: rows }, null, 2);
  return out;
}
