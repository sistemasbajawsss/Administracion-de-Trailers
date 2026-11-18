// 5L etapa 2: un usuario simulado a la vez hace el trabajo de captura y cada paso
// se comprueba en la base. Lo capturado queda en e2e/resultados/etapa2.json para
// la etapa 3 (comprobar números en todas las pantallas).
//
//   k6 run e2e/capturas.js   (desde pruebas-carga, app en http://localhost:3100;
//                             antes: node cuentas.mjs crear y k6 run e2e/preparar.js)

import { browser } from "k6/browser";

import { get, one, rpc, toCents, unitId, usdToMxnCents } from "./api.js";
import {
  BASE,
  MARK,
  check,
  choose,
  clickButton,
  attachFile,
  fill,
  fillDate,
  makePdf,
  formErrors,
  go,
  idle,
  money,
  session,
  pageText,
  report,
  results,
  shot,
  toasts,
  waitToast,
  waitUrl,
} from "./lib.js";

export const options = {
  scenarios: { capturas: { executor: "shared-iterations", vus: 1, iterations: 1, maxDuration: "30m", options: { browser: { type: "chromium" } } } },
};

const TODAY = __ENV.HOY || "2026-11-18";
const OCTOBER_DAY = "2026-10-20";
const MAINT = `${MARK} Cambio de aceite`;

/** Lo capturado, para la etapa 3. */
const ledger = { services: [], notes: [] };

/** Corre un paso; si truena, lo anota y sigue con el siguiente. */
let SESS = null;

async function step(name, given, fn) {
  try {
    await fn();
  } catch (e) {
    const page = (SESS && SESS.page) || given;
    if (page) await shot(page, `falla-${name.replace(/[^a-z0-9]+/gi, "-")}`).catch(() => {});
    check(name, false, `se detuvo: ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  }
}

async function pickUnit(page, number) {
  await page.locator("#unitId").click();
  await idle(page, 500);
  await fill(page, 'input[aria-label="Buscar unidad por número económico"]', number);
  await idle(page, 400);
  await page.locator(`//button[@aria-pressed][.//span[normalize-space(.)="${number}"]]`).first().click();
  await idle(page, 800);
}

async function radio(page, name, value) {
  await page.locator(`//label[.//input[@name="${name}" and @value="${value}"]]`).click();
  await idle(page, 300);
}

/** Llena el formulario de servicio nuevo y lo guarda. Regresa el id del servicio. */
async function captureService(page, s) {
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

  const shownTotal = await page.locator('//p[@aria-live="polite"][contains(@class, "text-3xl")]').textContent();
  await clickButton(page, "Guardar servicio");
  // Si ya hay un servicio de la unidad ese día, la app pregunta antes de guardar.
  const end = Date.now() + 40000;
  let asked = false;
  const seenToasts = [];
  const keepToasts = async () => {
    for (const t of await toasts(page)) if (!seenToasts.includes(t)) seenToasts.push(t);
  };
  while (Date.now() < end) {
    await keepToasts();
    const path = page.url().replace(BASE, "").split("?")[0];
    if (/^\/servicios\/[0-9a-f-]{36}$/.test(path)) break;
    if (!asked && (await page.locator('//button[contains(normalize-space(.), "es otro, guardar")]').count()) > 0) {
      asked = true;
      check(`${s.unit}: la app avisa que ya hay un servicio así ese día`, true);
      ledger.notes.push(`${s.unit}: la app preguntó por un servicio parecido del mismo día`);
      await clickButton(page, "es otro, guardar");
    }
    await page.waitForTimeout(300);
  }
  await waitUrl(page, (u) => /^\/servicios\/[0-9a-f-]{36}$/.test(u.split("?")[0]), 1000);
  const id = page.url().replace(BASE, "").split("?")[0].split("/")[2];
  await idle(page, 1000);
  await keepToasts();
  ledger.notes.push(`${s.unit}: avisos al guardar: ${seenToasts.join(" | ")}`);
  if (s.receipt) console.log(`avisos al guardar ${s.unit}: ${seenToasts.join(" | ")}`);
  return { id, shownTotal: shownTotal.trim(), toasts: seenToasts };
}

/** Lo que la BD guardó del servicio, para compararlo con lo capturado. */
function verifyService(name, id, s) {
  const row = one(
    `servicios?id=eq.${id}&select=fecha,kilometraje,tipo,lugar,descripcion,mantenimientos,sin_entrada_taller,motivo_sin_entrada,entrada_taller_id,taller:talleres(nombre),unidad:unidades(numero_economico),gastos(monto,moneda,monto_usd,tipo_cambio,concepto)`,
  );
  if (!check(`${name}: está en la base`, row !== null, id)) return null;
  const expectedLines = s.expenses.map((e) => (e.currency === "USD" ? usdToMxnCents(toCents(e.amount), e.rate) : toCents(e.amount)));
  const expectedTotal = expectedLines.reduce((a, b) => a + b, 0);
  const savedTotal = row.gastos.reduce((a, g) => a + toCents(g.monto), 0);
  check(`${name}: unidad`, row.unidad.numero_economico === s.unit, row.unidad.numero_economico);
  check(`${name}: fecha`, row.fecha === s.date, row.fecha);
  check(`${name}: tipo`, row.tipo === s.type, row.tipo);
  check(`${name}: lugar`, row.lugar === s.place, row.lugar);
  if (s.workshop) check(`${name}: taller`, row.taller && row.taller.nombre === s.workshop, row.taller && row.taller.nombre);
  if (s.km !== undefined) check(`${name}: kilometraje`, row.kilometraje === s.km, String(row.kilometraje));
  check(`${name}: ${s.expenses.length} gastos`, row.gastos.length === s.expenses.length, String(row.gastos.length));
  check(`${name}: total ${money(expectedTotal)}`, savedTotal === expectedTotal, `la base tiene ${money(savedTotal)}`);
  for (const e of s.expenses.filter((x) => x.currency === "USD")) {
    const g = row.gastos.find((x) => x.concepto === e.concept);
    const ok = g && g.moneda === "USD" && toCents(g.monto_usd) === toCents(e.amount) && Number(g.tipo_cambio) === Number(e.rate);
    check(`${name}: dólares de "${e.concept}" (US$${e.amount} a ${e.rate})`, ok, g ? `${g.moneda} ${g.monto_usd} a ${g.tipo_cambio} = ${g.monto}` : "no está");
  }
  if (s.receipt) {
    const rec = get(`comprobantes?servicio_id=eq.${id}&select=id`);
    check(`${name}: comprobante guardado`, rec.length === 1, String(rec.length));
  }
  const entry = { id, unit: s.unit, date: s.date, type: s.type, place: s.place, totalCents: expectedTotal, lines: expectedLines, expenses: s.expenses };
  ledger.services.push(entry);
  return { row, expectedTotal };
}

export default async function () {
  const T901 = unitId("T-901");
  const T902 = unitId("T-902");
  const R901 = unitId("R-901");

  const sess = session(browser);
  SESS = sess;
  const asAdmin = () => sess.as("ADMIN");
  const asCap = () => sess.as("CAPTURISTA");
  let a = null;
  let c = null;

  try {
    // 1. El admin programa un mantenimiento por kilometraje a T-901.
    a = await asAdmin();
    await step("1 mantenimiento programado", a, async () => {
      const existing = one(`mantenimientos_unidad?unidad_id=eq.${T901}&nombre=eq.${encodeURIComponent(MAINT)}&select=id`);
      if (existing) return void check("1 mantenimiento programado (ya existía)", true);
      await go(a, `/unidades/${T901}`);
      await clickButton(a, "Agregar");
      await fill(a, "#maintenance-name", MAINT);
      await a.locator('//*[@role="radio"][contains(normalize-space(.), "Por kilometraje")]').click();
      await fill(a, "#maintenance-km", "10000");
      await fillDate(a, "#maintenance-date", "2026-06-01");
      await fill(a, "#maintenance-last-km", "100000");
      await clickButton(a, "Agregar mantenimiento");
      const t = await waitToast(a, "quedó programado");
      const row = one(`mantenimientos_unidad?unidad_id=eq.${T901}&nombre=eq.${encodeURIComponent(MAINT)}&select=*`);
      check("1 mantenimiento programado (aviso y base)", t.ok && row !== null, `aviso: ${t.seen.join(" | ")}; base: ${JSON.stringify(row)}`);
    });

    // 2. Kilometraje semanal: hoy (miércoles) el capturista no registra; el admin sí.
    await step("2 kilometraje semanal", null, async () => {
      c = await asCap();
      await go(c, "/kilometraje");
      const capInput = c.locator('input[aria-label="Kilometraje de T-901"]');
      const capCan = (await capInput.count()) > 0 && (await capInput.isEnabled());
      check("2a capturista no registra km fuera de sus días (lun y mar)", !capCan, capCan ? "sí pudo escribir" : "");
      a = await asAdmin();
      const already = get(`lecturas_kilometraje?select=id,unidad:unidades!inner(notas)&unidad.notas=like.*PRUEBA%20E2E*&fecha=gte.${TODAY.slice(0, 8)}01`);
      if (already.length >= 3) return void check("2b lecturas de esta semana (ya estaban)", true);
      await go(a, "/kilometraje");
      for (const [number, km] of [["T-901", "109600"], ["T-902", "250000"], ["C-901", "45000"]]) {
        await fill(a, `input[aria-label="Kilometraje de ${number}"]`, km);
      }
      await a.locator('//button[@type="submit"][contains(normalize-space(.), "Guardar")]').click();
      const t = await waitToast(a, "lecturas");
      const rows = get(`lecturas_kilometraje?select=kilometraje,unidad:unidades!inner(numero_economico)&unidad.numero_economico=in.(T-901,T-902,C-901)&order=created_at.desc&limit=3`);
      check("2b admin registra 3 lecturas", t.ok && rows.length === 3, `aviso: ${t.seen.join(" | ")}; base: ${JSON.stringify(rows)}`);
    });

    // 3. T-901 entra a taller.
    c = await asCap();
    await step("3 entrada a taller T-901", c, async () => {
      if (one(`unidades?id=eq.${T901}&select=estatus`).estatus === "en_taller") return void check("3 T-901 ya estaba en taller", true);
      await go(c, "/taller/entrada");
      await pickUnit(c, "T-901");
      await fillDate(c, "#date", TODAY);
      await fill(c, "#fault", `${MARK} Fuga de aceite`);
      await clickButton(c, "Registrar entrada");
      const t = await waitToast(c, "entró a taller");
      const u = one(`unidades?id=eq.${T901}&select=estatus`);
      check("3 entrada a taller T-901", t.ok && u.estatus === "en_taller", `aviso: ${t.seen.join(" | ")}; estatus: ${u.estatus}`);
    });

    // 4. Correctivo en Taller Realso que cumple el mantenimiento; la unidad sale de taller.
    await step("4 correctivo T-901", c, async () => {
      const s = {
        unit: "T-901",
        type: "correctivo",
        maintenance: MAINT,
        place: "taller_propio",
        date: TODAY,
        km: 109700,
        description: `${MARK} Cambio de aceite y filtro`,
        expenses: [
          { category: "Mantenimiento preventivo (aceite y filtros)", concept: `${MARK} Aceite 15W40`, amount: "1234.56", currency: "MXN" },
          { category: "Mantenimiento preventivo (aceite y filtros)", concept: `${MARK} Filtro de aceite`, amount: "789.10", currency: "MXN" },
        ],
        receipt: 1,
      };
      const r = await captureService(c, s);
      const v = verifyService("4 correctivo T-901", r.id, s);
      if (v) check("4 total en pantalla antes de guardar", r.shownTotal === money(v.expectedTotal), r.shownTotal);
      const u = one(`unidades?id=eq.${T901}&select=estatus`);
      check("4 T-901 salió de taller con el servicio", u.estatus === "activo", u.estatus);
      const m = one(`mantenimientos_unidad?unidad_id=eq.${T901}&nombre=eq.${encodeURIComponent(MAINT)}&select=id`);
      const counted = v && m && (v.row.mantenimientos || []).includes(m.id);
      check("4 el servicio cuenta como el mantenimiento programado", counted, JSON.stringify(v && v.row.mantenimientos));
    });

    // 5. Reparación en camino de T-902 con taller y gasto en dólares.
    await step("5 en camino T-902", c, async () => {
      const s = {
        unit: "T-902",
        shopReason: "Reparación en camino",
        type: "correctivo",
        place: "en_camino",
        workshop: "[PRUEBA] Grúas y Taller Km 40",
        date: TODAY,
        km: 250300,
        description: `${MARK} Ponchadura en carretera`,
        expenses: [
          { category: "Llantas y rines", concept: `${MARK} Llanta 11R22.5`, amount: "123.45", currency: "USD", rate: "17.2345" },
          { category: "Grúa y arrastre", concept: `${MARK} Arrastre`, amount: "350.00", currency: "MXN" },
        ],
        receipt: 2,
      };
      const r = await captureService(c, s);
      const v = verifyService("5 en camino T-902", r.id, s);
      if (v) {
        check("5 total en pantalla antes de guardar", r.shownTotal === money(v.expectedTotal), r.shownTotal);
        check("5 queda sin entrada a taller con su motivo", v.row.sin_entrada_taller === true || Boolean(v.row.motivo_sin_entrada), `${v.row.sin_entrada_taller} ${v.row.motivo_sin_entrada}`);
      }
    });

    // 6. Caja sin odómetro en taller de fuera, nosotros llevamos piezas, pesos y dólares.
    await step("6 taller de fuera R-901", c, async () => {
      const s = {
        unit: "R-901",
        shopReasonText: `${MARK} Revisión en el patio del taller`,
        shopReason: "Otro",
        type: "preventivo",
        place: "taller_externo",
        workshop: "[PRUEBA] Taller Diesel Pérez",
        partsBy: "nosotros",
        date: TODAY,
        description: `${MARK} Revisión de piso y puertas`,
        expenses: [
          { category: "Caja: piso, puertas y estructura", concept: `${MARK} Tablas de piso`, amount: "1000.00", currency: "USD", rate: "18.0000" },
          { category: "Caja: piso, puertas y estructura", concept: `${MARK} Tornillería`, amount: "0.99", currency: "USD", rate: "17.9999" },
          { category: "Otros (especificar)", concept: `${MARK} Propina de patio`, amount: "0.01", currency: "MXN" },
        ],
        receipt: 3,
      };
      const r = await captureService(c, s);
      const v = verifyService("6 taller de fuera R-901", r.id, s);
      if (v) check("6 total en pantalla antes de guardar", r.shownTotal === money(v.expectedTotal), r.shownTotal);
      ledger.r901 = r.id;
    });

    // 7. Ticket del admin para C-901; el capturista 2 lo acepta y registra el servicio.
    a = await asAdmin();
    await step("7 ticket C-901", a, async () => {
      const inShop = one(`unidades?numero_economico=eq.C-901&select=estatus`).estatus === "en_taller";
      if (!inShop) {
      await go(a, "/tickets/nuevo");
      await pickUnit(a, "C-901");
      await fill(a, "#fault", `${MARK} No enciende`);
      await a.locator('//*[@role="radio"][contains(normalize-space(.), "Urgente")]').click();
      await clickButton(a, "Enviar ticket");
      const t = await waitToast(a, "enviado a los capturistas");
      check("7a admin levanta ticket urgente de C-901", t.ok, t.seen.join(" | "));

      {
        const p = await sess.as("CAPTURISTA2");
        await go(p, "/tickets");
        await p.locator('(//article[contains(normalize-space(.), "C-901")]//button[normalize-space(.)="Aceptar"])[1]').click();
        await idle(p, 600);
        await clickButton(p, "Aceptar y dar entrada");
        const t2 = await waitToast(p, "entró a taller");
        const u = one(`unidades?numero_economico=eq.C-901&select=estatus`);
        check("7b capturista 2 acepta y C-901 entra a taller", t2.ok && u.estatus === "en_taller", `${t2.seen.join(" | ")}; ${u.estatus}`);
      }
      } else check("7 C-901 ya tenía su ticket aceptado (en taller)", true);
      {
        const p = await sess.as("CAPTURISTA2");

        const s = {
          unit: "C-901",
          type: "servicio",
          place: "taller_propio",
          date: TODAY,
          km: 45100,
          description: `${MARK} Cambio de batería`,
          expenses: [{ category: "Sistema eléctrico y luces", concept: `${MARK} Batería`, amount: "5000.00", currency: "MXN" }],
          receipt: 4,
        };
        const r = await captureService(p, s);
        verifyService("7c servicio C-901", r.id, s);
        const u2 = one(`unidades?numero_economico=eq.C-901&select=estatus`);
        check("7d C-901 salió de taller", u2.estatus === "activo", u2.estatus);
      }
    });

    // 8. El admin corrige el monto del aceite (con motivo).
    a = await asAdmin();
    await step("8 editar monto", a, async () => {
      const svc = ledger.services.find((x) => x.unit === "T-901");
      if (!svc) throw new Error("no hay servicio de T-901 para editar");
      await go(a, `/servicios/${svc.id}/editar`);
      await fill(a, "#expense-0-amount", "1300.00");
      await fill(a, "#reason", `${MARK} El ticket decía otro monto`);
      await clickButton(a, "Guardar cambios");
      const t = await waitToast(a, "Cambios guardados");
      svc.expenses[0].amount = "1300.00";
      svc.lines[0] = 130000;
      svc.totalCents = svc.lines.reduce((x, y) => x + y, 0);
      const row = one(`servicios?id=eq.${svc.id}&select=gastos(monto)`);
      const saved = row.gastos.reduce((x, g) => x + toCents(g.monto), 0);
      check(`8 editar: total nuevo ${money(svc.totalCents)}`, t.ok && saved === svc.totalCents, `${t.seen.join(" | ")}; base ${money(saved)}`);
      const hist = get(`historial_cambios?select=id&servicio_id=eq.${svc.id}`);
      check("8 el cambio queda en el historial", hist.length > 0, String(hist.length));
    });

    // 9. Eliminar y restaurar el servicio de R-901.
    await step("9 eliminar y restaurar", a, async () => {
      const svc = ledger.services.find((x) => x.unit === "R-901");
      if (!svc) throw new Error("no hay servicio de R-901");
      await go(a, `/servicios/${svc.id}`);
      await clickButton(a, "Eliminar");
      await fill(a, "#delete-reason", `${MARK} Prueba de eliminar`);
      await clickButton(a, "Eliminar servicio");
      const t = await waitToast(a, "Servicio eliminado");
      let gone = one(`servicios?id=eq.${svc.id}&select=id`);
      for (let i = 0; i < 10 && gone !== null; i++) {
        await idle(a, 500);
        gone = one(`servicios?id=eq.${svc.id}&select=id`);
      }
      check("9a eliminado (ya no está en la base)", gone === null, t.ok ? "" : "no se alcanzó a ver el aviso");

      await go(a, "/servicios/eliminados");
      await a.locator('(//*[self::li or self::article][contains(normalize-space(.), "R-901")]//button[normalize-space(.)="Restaurar"])[1]').click();
      await idle(a, 500);
      await a.locator('textarea[id^="restore-reason-"]').fill(`${MARK} Prueba de restaurar`);
      await clickButton(a, "Restaurar servicio");
      const t2 = await waitToast(a, "Servicio restaurado");
      const back = one(`servicios?id=eq.${svc.id}&select=id,gastos(monto)`);
      const saved = back ? back.gastos.reduce((x, g) => x + toCents(g.monto), 0) : 0;
      check(`9b restaurado igual (${money(svc.totalCents)})`, t2.ok && back !== null && saved === svc.totalCents, `${t2.seen.join(" | ")}; base ${money(saved)}`);
    });

    // 10. Mes cerrado: octubre ya cerró (día 5). El capturista no puede; el admin
    // reabre, el capturista captura y el admin lo vuelve a cerrar.
    await step("10 mes cerrado", null, async () => {
      // Si una corrida anterior se quedó a la mitad, octubre puede estar abierto: se cierra primero.
      if (!rpc("mes_cerrado", { p_fecha: OCTOBER_DAY })) {
        a = await asAdmin();
        await go(a, "/dashboard");
        await a.locator('(//*[contains(normalize-space(.), "octubre") or contains(normalize-space(.), "Octubre")]/ancestor-or-self::*[.//button[normalize-space(.)="Cerrar"]][1]//button[normalize-space(.)="Cerrar"])[1]').click();
        await idle(a, 500);
        await clickButton(a, "Cerrar el mes");
        await waitToast(a, "quedó cerrado");
        ledger.notes.push("octubre estaba abierto por una corrida anterior; se cerró antes del paso 10");
      }
      c = await asCap();
      await go(c, "/servicios/nuevo");
      await pickUnit(c, "T-902");
      await fillDate(c, "#date", OCTOBER_DAY).catch(() => {});
      await radio(c, "serviceType", "servicio");
      await idle(c, 500);
      const text = await pageText(c);
      const errors = await formErrors(c);
      const blocked = /cerrad/i.test(errors.join(" ")) || /mes cerrado|está cerrado|ya cerró/i.test(text);
      check("10a el capturista ve que octubre está cerrado", blocked, errors.join(" | ") || "sin mensaje");

      a = await asAdmin();
      await go(a, "/dashboard");
      await a.locator('(//*[contains(normalize-space(.), "octubre") or contains(normalize-space(.), "Octubre")]/ancestor-or-self::*[.//button[normalize-space(.)="Reabrir"]][1]//button[normalize-space(.)="Reabrir"])[1]').click();
      await idle(a, 500);
      await fill(a, "#reabrir-motivo", `${MARK} Captura atrasada de prueba`);
      await clickButton(a, "Reabrir el mes");
      const t = await waitToast(a, "quedó abierto");
      check("10b el admin reabre octubre", t.ok, t.seen.join(" | "));

      const s = {
        unit: "T-902",
        shopReason: "Reparación en camino",
        type: "servicio",
        place: "en_camino",
        workshop: "[PRUEBA] Grúas y Taller Km 40",
        date: OCTOBER_DAY,
        km: 248000,
        description: `${MARK} Servicio atrasado de octubre`,
        expenses: [{ category: "Otros (especificar)", concept: `${MARK} Revisión`, amount: "100.00", currency: "MXN" }],
      };
      c = await asCap();
      const r = await captureService(c, s);
      verifyService("10c servicio en octubre reabierto", r.id, s);

      a = await asAdmin();
      await go(a, "/dashboard");
      await a.locator('(//*[contains(normalize-space(.), "octubre") or contains(normalize-space(.), "Octubre")]/ancestor-or-self::*[.//button[normalize-space(.)="Cerrar"]][1]//button[normalize-space(.)="Cerrar"])[1]').click();
      await idle(a, 500);
      await clickButton(a, "Cerrar el mes");
      const t2 = await waitToast(a, "quedó cerrado");
      check("10d el admin vuelve a cerrar octubre", t2.ok, t2.seen.join(" | "));
    });
  } finally {
    await sess.close();
    report();
    // handleSummary no ve lo de la iteración: el envoltorio guarda esta línea en e2e/resultados/.
    console.log(`LEDGER ${JSON.stringify({ fecha: new Date().toISOString(), casos: results, ...ledger })}`);
  }
}


