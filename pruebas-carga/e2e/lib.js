// Ayudantes de las pruebas de punta a punta (5L, D27): un navegador real (k6
// browser con Edge) que usa la app como una persona.
//
// Cada usuario simulado abre su propio contexto (sus propias cookies), entra con
// su cuenta [PRUEBA K6] por la pantalla de login y trabaja con clics y teclado.

import { readEnv } from "../lib/sesion.js";

export const env = readEnv(open("../.env.k6"));
export const BASE = __ENV.BASE_URL || "http://localhost:3100";
export const MARK = "[PRUEBA E2E]";

/** Resultado de cada caso: se junta todo y se imprime al final. */
export const results = [];
export function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "BIEN " : "FALLA"} ${name}${detail ? ` -> ${detail}` : ""}`);
  return Boolean(ok);
}
export function report() {
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length} de ${results.length} casos bien.`);
  for (const r of bad) console.log(`  FALLA ${r.name}: ${r.detail}`);
}

/** Texto en XPath, con comillas seguras. */
function xText(text) {
  if (!text.includes('"')) return `"${text}"`;
  return `concat(${text.split('"').map((p) => `"${p}"`).join(`, '"', `)})`;
}

export async function newUser(browser, key) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-MX", timezoneId: "America/Tijuana" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill(env[`K6_${key}_EMAIL`]);
  await page.locator('input[type="password"]').fill(env[`K6_${key}_PASSWORD`]);
  await page.locator('button[type="submit"]').click();
  await waitUrl(page, (u) => !u.includes("/login"), 30000);
  await idle(page);
  return { context, page };
}

/** Espera a que la URL cumpla la condición. */
export async function waitUrl(page, test, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const url = page.url();
    if (test(url.replace(BASE, ""))) return url;
    await page.waitForTimeout(200);
  }
  throw new Error(`La página no llegó a donde se esperaba (está en ${page.url()})`);
}

/** Pausa corta para que termine de pintar lo que sigue de una acción. */
export async function idle(page, ms = 800) {
  await page.waitForTimeout(ms);
}

export async function go(page, path) {
  await page.goto(`${BASE}${path}`);
  await idle(page, 1200);
}

export function byText(page, text, tag = "*") {
  return page.locator(`//${tag}[contains(normalize-space(.), ${xText(text)})][not(.//${tag}[contains(normalize-space(.), ${xText(text)})])]`);
}

export async function clickButton(page, text) {
  const loc = page.locator(`//button[contains(normalize-space(.), ${xText(text)})]`);
  await loc.first().click();
  await idle(page, 400);
}

export async function clickLink(page, text) {
  await page.locator(`//a[contains(normalize-space(.), ${xText(text)})]`).first().click();
  await idle(page, 1000);
}

/** Select de la app (base-ui): abre el disparador y elige la opción por su texto. */
export async function choose(page, triggerSelector, optionText) {
  await page.locator(triggerSelector).click();
  await idle(page, 300);
  await page.locator(`//*[@role="option"][contains(normalize-space(.), ${xText(optionText)})]`).first().click();
  await idle(page, 300);
}

export async function fill(page, selector, value) {
  const loc = page.locator(selector);
  await loc.fill("");
  await loc.fill(String(value));
}

/** Textos de los avisos (toasts) que están en pantalla. */
export async function toasts(page) {
  return page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent.trim()));
}

/** Espera un aviso que contenga el texto; regresa todos los avisos vistos. */
export async function waitToast(page, text, timeout = 20000) {
  const end = Date.now() + timeout;
  let seen = [];
  while (Date.now() < end) {
    seen = await toasts(page);
    if (seen.some((t) => t.includes(text))) return { ok: true, seen };
    await page.waitForTimeout(250);
  }
  return { ok: false, seen };
}

/** Texto visible de la página (sin espacios repetidos). */
export async function pageText(page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
}

/** "$12,345.67" -> 1234567 centavos. */
export function cents(text) {
  const m = String(text).replace(/\s/g, "").match(/-?\$?-?[\d,]+(\.\d{1,2})?/);
  if (!m) return null;
  const clean = m[0].replace(/[$,]/g, "");
  const [whole, frac = ""] = clean.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(parseInt(whole, 10)) * 100 + parseInt((frac + "00").slice(0, 2), 10));
}

/** 1234567 -> "$12,345.67" (formato es-MX de la app). */
export function money(c) {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** Guarda una captura para que el usuario la vea. */
export async function shot(page, name) {
  await page.screenshot({ path: `e2e/capturas/${name}.png`, fullPage: true });
}

/** Mensajes de error visibles en el formulario (para explicar una falla). */
export async function formErrors(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="field-error"], [role="alert"]')]
      .map((e) => e.textContent.trim())
      .filter(Boolean),
  );
}
