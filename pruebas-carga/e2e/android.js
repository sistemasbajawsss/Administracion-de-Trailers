// 5L: comprobante PDF que llega sin tipo, como desde algunos celulares Android
// (WhatsApp, Drive). setInputFiles de k6 lo entrega así. Antes se rechazaba en
// Storage (invalid_mime_type); debe subirse bien.
//
//   k6 run e2e/android.js   (desde pruebas-carga, app en http://localhost:3100)

import { browser } from "k6/browser";

import { get } from "./api.js";
import { check, go, idle, makePdf, report, results, session, waitToast } from "./lib.js";

export const options = {
  scenarios: { android: { executor: "shared-iterations", vus: 1, iterations: 1, options: { browser: { type: "chromium" } } } },
};

export default async function () {
  const sess = session(browser);
  try {
    const page = await sess.as("ADMIN");
    const svc = get("servicios?select=id,unidad:unidades!inner(notas)&unidad.notas=like.*PRUEBA%20E2E*&fecha=gte.2026-11-01&order=created_at.desc&limit=1")[0];
    const before = get(`comprobantes?servicio_id=eq.${svc.id}&select=id`).length;
    await go(page, `/servicios/${svc.id}`);
    let type = null;
    await page.evaluate(() => {
      document.querySelector('input[type="file"][multiple]').addEventListener("change", (e) => {
        window.__tipo = e.target.files[0] ? e.target.files[0].type : "sin archivo";
      }, { capture: true });
    });
    await page.setInputFiles('input[type="file"][multiple]', { name: "ticket-android.pdf", mimeType: "application/pdf", buffer: makePdf("PRUEBA E2E android") });
    type = await page.evaluate(() => window.__tipo);
    check("el archivo llega sin tipo (como en Android)", type === "", `tipo "${type}"`);
    await idle(page, 2500);
    await page.locator('//button[contains(normalize-space(.), "Subir")]').first().click();
    const t = await waitToast(page, "agregado");
    await idle(page, 1000);
    const after = get(`comprobantes?servicio_id=eq.${svc.id}&select=id,tipo_mime`);
    check("el PDF sin tipo se sube y queda en la base", t.ok && after.length === before + 1, `avisos: ${t.seen.join(" | ")}; antes ${before}, después ${after.length}`);
    const last = after[after.length - 1];
    check("se guardó como application/pdf", after.some((r) => r.tipo_mime === "application/pdf"), JSON.stringify(last));
  } finally {
    await sess.close();
    report();
    console.log(`LEDGER ${JSON.stringify({ fecha: new Date().toISOString(), casos: results })}`);
  }
}
