// 5L etapa 1: el admin da de alta, desde "Nueva unidad", las 4 unidades de la
// prueba (D25). Si ya existen, no las repite.
//
//   k6 run e2e/preparar.js   (desde pruebas-carga, app en http://localhost:3100)

import { browser } from "k6/browser";

import { MARK, check, choose, clickButton, fill, formErrors, go, newUser, pageText, report, shot, waitToast } from "./lib.js";

export const options = {
  scenarios: { preparar: { executor: "shared-iterations", vus: 1, iterations: 1, options: { browser: { type: "chromium" } } } },
};

export const UNITS = [
  { number: "T-901", type: "Trailer", operation: "Local", group: "local" },
  { number: "T-902", type: "Trailer", operation: "Foráneo", group: "foraneo" },
  { number: "R-901", type: "Caja", operation: "Local", length: "53 pies", group: "local" },
  { number: "C-901", type: "Camioneta", group: "camionetas" },
];

export default async function () {
  const { context, page } = await newUser(browser, "ADMIN");
  try {
    for (const u of UNITS) {
      await go(page, `/unidades?grupo=${u.group}&q=${u.number}`);
      if ((await pageText(page)).includes(u.number)) {
        check(`unidad ${u.number} ya existía`, true);
        continue;
      }
      await go(page, "/unidades/nueva");
      await choose(page, "#type", u.type);
      await fill(page, "#economicNumber", u.number);
      if (u.operation) await page.locator(`//button[@role="radio"][normalize-space(.)="${u.operation}"]`).click();
      if (u.length) await choose(page, "#lengthFt", u.length);
      await fill(page, "#notes", `${MARK} Unidad de la prueba de punta a punta; se borra en la limpieza.`);
      await clickButton(page, "Crear unidad");
      const t = await waitToast(page, `Unidad ${u.number} creada`);
      // El aviso dura unos segundos; si no se alcanzó a ver, la prueba es que la unidad ya está en la lista.
      let created = t.ok;
      if (!created) {
        await go(page, `/unidades?grupo=${u.group}&q=${u.number}`);
        created = (await pageText(page)).includes(u.number);
      }
      if (!created) await shot(page, `alta-${u.number}`);
      check(`alta de ${u.number} desde Nueva unidad`, created, created ? "" : `avisos: ${t.seen.join(" | ")}; errores: ${(await formErrors(page)).join(" | ")}; en ${page.url()}`);
    }
  } finally {
    await page.close();
    await context.close();
    report();
  }
}
