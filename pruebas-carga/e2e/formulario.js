// Formulario de servicio nuevo, como lo llena una persona (5L). Lo usan la
// etapa 2 (capturas.js) y la 4 (simultaneo.js). Se separa en llenar y guardar
// para que la etapa 4 pueda guardar a la misma hora en varios navegadores.

import { BASE, attachFile, check, choose, clickButton, fill, fillDate, formErrors, go, idle, makePdf, pageText, toasts, waitUrl } from "./lib.js";

export async function pickUnit(page, number) {
  await page.locator("#unitId").click();
  await idle(page, 500);
  await fill(page, 'input[aria-label="Buscar unidad por número económico"]', number);
  await idle(page, 400);
  await page.locator(`//button[@aria-pressed][.//span[normalize-space(.)="${number}"]]`).first().click();
  await idle(page, 800);
}

export async function radio(page, name, value) {
  await page.locator(`//label[.//input[@name="${name}" and @value="${value}"]]`).click();
  await idle(page, 300);
}

/** Llena el formulario sin guardar. Regresa el total que muestra la pantalla. */
export async function fillService(page, s) {
  await go(page, "/servicios/nuevo");
  await pickUnit(page, s.unit);
  if (s.shopReason) await clickButton(page, s.shopReason);
  if (s.shopReasonText) await fill(page, "#noEntryReason", s.shopReasonText);
  await radio(page, "serviceType", s.type);
  if (s.maintenance) {
    await page.locator(`//label[.//input[@type="checkbox"]][contains(normalize-space(.), "${s.maintenance}")]`).click();
    await idle(page, 300);
  }
  await radio(page, "place", s.place);
  if (s.workshop) await choose(page, "#workshopId", s.workshop);
  if (s.partsBy) await radio(page, "partsBy", s.partsBy);
  await fillDate(page, "#date", s.date);
  if (s.km !== undefined) await fill(page, "#mileage", s.km);
  await fill(page, "#description", s.description);

  for (let i = 0; i < s.expenses.length; i++) {
    const e = s.expenses[i];
    if (i > 0) await clickButton(page, "Agregar otro gasto");
    await choose(page, `#expense-${i}-category`, e.category);
    await fill(page, `#expense-${i}-concept`, e.concept);
    if (e.currency === "USD") {
      await page.locator(`//*[@aria-label="Moneda del gasto ${i + 1}"]//*[normalize-space(.)="Dólares"]`).click();
      // La app sugiere el tipo de cambio de Banxico; se espera y se pone el fijo de la prueba.
      await idle(page, 2500);
      await fill(page, `#expense-${i}-rate`, e.rate);
    }
    await fill(page, `#expense-${i}-amount`, e.amount);
  }

  if (s.receipt) {
    await attachFile(page, 'input[type="file"][multiple]', `prueba-e2e-${s.receipt}.pdf`, "application/pdf", makePdf(`PRUEBA E2E ${s.unit}`));
    await idle(page, 2000);
    const listed = (await pageText(page)).includes(`prueba-e2e-${s.receipt}.pdf`);
    check(`${s.unit}: el comprobante aparece en el formulario`, listed, listed ? "" : (await formErrors(page)).join(" | "));
  }

  return (await page.locator('//p[@aria-live="polite"][contains(@class, "text-3xl")]').textContent()).trim();
}

/**
 * Guarda el formulario ya lleno y espera la página del servicio. Si la app
 * pregunta por un servicio parecido del mismo día, contesta "es otro".
 */
export async function saveService(page) {
  await clickButton(page, "Guardar servicio");
  const end = Date.now() + 180000; // con varios usuarios a la vez puede tardar
  let asked = false;
  const seen = [];
  const keep = async () => {
    for (const t of await toasts(page)) if (!seen.includes(t)) seen.push(t);
  };
  while (Date.now() < end) {
    await keep();
    const path = page.url().replace(BASE, "").split("?")[0];
    if (/^\/servicios\/[0-9a-f-]{36}$/.test(path)) break;
    if (!asked && (await page.locator('//button[contains(normalize-space(.), "es otro, guardar")]').count()) > 0) {
      asked = true;
      await clickButton(page, "es otro, guardar");
    }
    await page.waitForTimeout(300);
  }
  if (!/^\/servicios\/[0-9a-f-]{36}$/.test(page.url().replace(BASE, "").split("?")[0])) {
    const errors = await formErrors(page).catch(() => []);
    throw new Error(`No llegó a la página del servicio; avisos: ${seen.join(" | ")}; errores: ${errors.join(" | ")}`);
  }
  await waitUrl(page, (u) => /^\/servicios\/[0-9a-f-]{36}$/.test(u.split("?")[0]), 1000);
  const id = page.url().replace(BASE, "").split("?")[0].split("/")[2];
  await idle(page, 1000);
  await keep();
  return { id, asked, toasts: seen };
}
