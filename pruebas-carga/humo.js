// Prueba de humo (5K, etapa 0): cada rol inicia sesión y abre el Inicio una vez.
// Confirma que la sesión armada para k6 la acepta la app (no manda a /login).
//
//   k6 run pruebas-carga/humo.js            (app en http://localhost:3100)

import http from "k6/http";
import { check } from "k6";

import { login, readEnv } from "./lib/sesion.js";

const env = readEnv(open("./.env.k6"));
const BASE = __ENV.BASE_URL || "http://localhost:3100";

export const options = { vus: 1, iterations: 1 };

export default function () {
  for (const role of ["admin", "capturista", "gerente"]) {
    const { cookie } = login(env, role);
    const res = http.get(`${BASE}/`, { headers: { Cookie: cookie }, redirects: 0, tags: { name: `inicio-${role}` } });
    check(res, {
      [`${role}: Inicio responde 200`]: (r) => r.status === 200,
      [`${role}: no manda a /login`]: (r) => !String(r.headers.Location || "").includes("/login"),
      [`${role}: trae su nombre`]: (r) => r.body.includes("PRUEBA K6"),
    });
  }
}
