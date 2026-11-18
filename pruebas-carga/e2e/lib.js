// Ayudantes de las pruebas de punta a punta (5L, D27): un navegador real (k6
// browser con Edge) que usa la app como una persona.
//
// Cada usuario simulado abre su propio contexto (sus propias cookies), entra con
// su cuenta [PRUEBA K6] por la pantalla de login y trabaja con clics y teclado.

import encoding from "k6/encoding";

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
  await waitUrl(page, (u) => !u.includes("/login"), 90000);
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

/** Pantallas que salieron con "No se pudo cargar esta pantalla" (se anotan como falla). */
export const errorScreens = [];

export async function go(page, path) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto(`${BASE}${path}`, { timeout: 90000 });
    await idle(page, 1200);
    let text = "";
    try {
      text = await page.evaluate(() => document.body.innerText);
    } catch {
      text = "";
    }
    if (!text.includes("No se pudo cargar esta pantalla")) return;
    errorScreens.push(`${path} (intento ${attempt})`);
    results.push({ name: `pantalla de error en ${path}`, ok: false, detail: `intento ${attempt}` });
    console.log(`FALLA pantalla de error en ${path} -> intento ${attempt}`);
    await page.waitForTimeout(2000);
  }
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
  const trigger = page.locator(triggerSelector);
  await trigger.click();
  await idle(page, 400);
  // Como una persona con teclado: escribir el principio del nombre salta a esa opción y Enter la elige.
  // Solo la parte sin acentos: el teclado simulado no manda bien "ú" o "é".
  const typed = optionText.slice(0, 40).split(/[^\x20-\x7e]/)[0];
  await page.keyboard.type(typed);
  await idle(page, 300);
  await page.keyboard.press("Enter");
  await idle(page, 400);
  const shown = (await trigger.textContent()).replace(/\s+/g, " ").trim();
  if (!shown.includes(optionText)) {
    // Respaldo: clic en la opción, llevándola a la vista.
    if (!(await page.evaluate(() => Boolean(document.querySelector('[role="listbox"]'))))) {
      await trigger.click();
      await idle(page, 400);
    }
    await page.evaluate((text) => {
      document.querySelectorAll("[data-e2e-pick]").forEach((e) => e.removeAttribute("data-e2e-pick"));
      const opts = [...document.querySelectorAll('[role="option"]')];
      const o = opts.find((x) => x.textContent.replace(/\s+/g, " ").trim() === text) || opts.find((x) => x.textContent.includes(text));
      if (o) {
        o.scrollIntoView({ block: "center" });
        o.click();
      }
    }, optionText);
    await idle(page, 400);
    const again = (await trigger.textContent()).replace(/\s+/g, " ").trim();
    if (!again.includes(optionText)) throw new Error(`No se pudo elegir "${optionText}" en ${triggerSelector} (quedó "${again}")`);
  }
}

/** Fecha como la escribe una persona: día, mes y año con el teclado (aaaa-mm-dd de entrada). */
export async function fillDate(page, selector, iso) {
  const [y, m, d] = iso.split("-");
  const loc = page.locator(selector);
  await loc.focus();
  await page.keyboard.type(`${d}${m}${y}`);
  await idle(page, 300);
  const value = await loc.inputValue();
  if (value !== iso) throw new Error(`La fecha ${selector} quedó en "${value}" en vez de ${iso}`);
}

export async function fill(page, selector, value) {
  const loc = page.locator(selector);
  await loc.fill("");
  await loc.fill(String(value));
}

/** Textos de los avisos (toasts) que están en pantalla. */
export async function toasts(page) {
  try {
    return await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent.trim()));
  } catch {
    return []; // la página estaba cambiando de pantalla
  }
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

/**
 * Un solo navegador que cambia de cuenta (k6 browser no deja dos contextos
 * abiertos en el mismo usuario simulado): al pedir otra cuenta, borra las
 * cookies, abre una pestaña nueva y entra por el login.
 */
export function session(browser) {
  let context = null;
  let page = null;
  let current = null;
  return {
    async as(key) {
      if (current === key && page) return page;
      if (page) await page.close();
      if (!context) context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-MX", timezoneId: "America/Tijuana" });
      else await context.clearCookies();
      page = await context.newPage();
      // Con varios navegadores arrancando a la vez la primera carga tarda más.
      await page.goto(`${BASE}/login`, { timeout: 90000 });
      await page.locator('input[type="email"]').fill(env[`K6_${key}_EMAIL`]);
      await page.locator('input[type="password"]').fill(env[`K6_${key}_PASSWORD`]);
      await page.locator('button[type="submit"]').click();
      try {
        await waitUrl(page, (u) => !u.includes("/login"), 90000);
      } catch {
        const text = await safeText(page);
        throw new Error(`No pudo entrar como ${key}; la pantalla de login dice: ${text.slice(0, 300)}`);
      }
      await idle(page);
      current = key;
      return page;
    },
    get page() {
      return page;
    },
    async close() {
      if (page) await page.close();
      if (context) await context.close();
    },
  };
}

/**
 * Adjunta un archivo como lo hace el navegador de una computadora (con su tipo,
 * p. ej. application/pdf). setInputFiles de k6 lo deja sin tipo, que es lo que
 * pasa con algunos celulares; para probar ese caso se usa setInputFiles.
 */
export async function attachFile(page, selector, name, type, base64) {
  await page.evaluate(
    ({ selector, name, type, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      const input = document.querySelector(selector);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { selector, name, type, base64 },
  );
}

/** Igual que pageText, pero espera si la página estaba cambiando de pantalla. */
export async function safeText(page) {
  for (let i = 0; i < 10; i++) {
    try {
      return await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    } catch {
      await page.waitForTimeout(500);
    }
  }
  return "";
}

/** PDF chiquito y distinto en cada llamada (cada ticket real es otro archivo). Regresa base64. */
export function makePdf(label) {
  const text = `${label} ${Date.now()} ${Math.random().toString(36).slice(2)}`.replace(/[^A-Za-z0-9 -]/g, "");
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoding.b64encode(out);
}
