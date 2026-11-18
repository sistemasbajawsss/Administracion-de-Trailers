// Regresar a una pantalla ya vista (5K): con Chrome real, cuenta cuántas
// peticiones de datos salen al moverse por la app, al volver desde el menú y
// con el botón atrás. Es lo que el usuario preguntó: que no se consulte otra
// vez lo que ya se vio.
//
//   k6 run pruebas-carga/navegador.js            (app en http://localhost:3100)
//   Sin Chrome instalado se usa Edge (también es Chromium):
//     K6_BROWSER_EXECUTABLE_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
//   Para ver la ventana: K6_BROWSER_HEADLESS=false
//
// Inicia sesión como el admin [PRUEBA K6] en la pantalla de login (cuenta de
// prueba, solo en localhost). Cuenta solo peticiones a la app: "datos" son las
// pantallas (RSC), "prefetch" las que Next adelanta por los enlaces visibles,
// "otras" documentos y acciones; los archivos estáticos (_next/static) aparte.

import { browser } from "k6/browser";

import { readEnv } from "./lib/sesion.js";

const env = readEnv(open("./.env.k6"));
const BASE = __ENV.BASE_URL || "http://localhost:3100";
const WAIT = 3000; // ms para que terminen la navegación y los prefetch

export const options = {
  scenarios: {
    navegador: { executor: "shared-iterations", vus: 1, iterations: 1, options: { browser: { type: "chromium" } } },
  },
};

export default async function () {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  let log = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!url.startsWith(BASE)) return;
    const h = req.headers();
    const path = url.slice(BASE.length);
    let kind = "otras";
    if (path.startsWith("/_next/static")) kind = "estaticos";
    else if (h["next-router-prefetch"] || h["next-router-segment-prefetch"]) kind = "prefetch";
    else if (h.rsc || path.includes("_rsc=")) kind = "datos";
    log.push({ kind, method: req.method(), path: path.split("?")[0] });
  });

  const steps = [];
  const step = async (label, action) => {
    log = [];
    await action();
    await page.waitForTimeout(WAIT);
    const count = (k) => log.filter((r) => r.kind === k).length;
    steps.push({
      paso: label,
      datos: count("datos"),
      prefetch: count("prefetch"),
      otras: count("otras"),
      estaticos: count("estaticos"),
      detalle: log.filter((r) => r.kind !== "estaticos").map((r) => `${r.kind} ${r.method} ${r.path}`),
    });
  };
  // Clic en el enlace visible del menú (Link de Next: navegación dentro de la app).
  const menu = (href) =>
    page.evaluate((h) => {
      const links = [...document.querySelectorAll(`a[href="${h}"]`)];
      const link = links.find((a) => a.checkVisibility()) || links[0];
      if (!link) throw new Error(`No hay enlace a ${h} en ${location.pathname}`);
      link.click();
    }, href);

  try {
    await page.goto(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(env.K6_ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(env.K6_ADMIN_PASSWORD);
    await Promise.all([page.waitForNavigation(), page.locator('button[type="submit"]').click()]);
    await page.waitForTimeout(WAIT);

    await step("1. Inicio -> Servicios (primera vez)", () => menu("/servicios"));
    await step("2. Servicios -> Inicio desde el menú (ya vista)", () => menu("/"));
    await step("3. Atrás: regresa a Servicios (ya vista)", () => page.goBack());
    await step("4. Servicios -> Mantenimientos (primera vez)", () => menu("/mantenimientos"));
    await step("5. Mantenimientos -> Servicios desde el menú (ya vista)", () => menu("/servicios"));
    await step("6. Atrás: regresa a Mantenimientos (ya vista)", () => page.goBack());
    await step("7. Esperar 35 s y volver a Inicio desde el menú", async () => {
      await page.waitForTimeout(35000);
      log = [];
      await menu("/");
    });
  } finally {
    await page.close();
    await context.close();
    report(steps);
  }
}

function report(steps) {
  console.log("\n" + steps.map((s) => `${s.paso}\n   datos ${s.datos}, prefetch ${s.prefetch}, otras ${s.otras}, estáticos ${s.estaticos}\n   ${s.detalle.join("\n   ")}`).join("\n\n"));
}
