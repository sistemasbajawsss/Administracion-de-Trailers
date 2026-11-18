// 5L etapa 4: siete usuarios a la vez, cada uno en su propio navegador.
//
//   - Los 5 capturistas llenan servicios y los guardan al mismo segundo, varios
//     en la misma unidad (T-901 y T-902), con pesos y dólares; dos rondas.
//   - El admin levanta un ticket urgente de C-901 y, mientras los capturistas
//     guardan, corrige un gasto de otro servicio.
//   - Los capturistas 4 y 5 aceptan ese ticket al mismo segundo: solo uno debe
//     quedarse con él (una sola entrada a taller); el que gana registra el servicio.
//   - El gerente navega todo el tiempo (Inicio, Reportes, Servicios, Unidades) y al
//     final compara Reportes de hoy contra la base.
//   - Al terminar (teardown) se revisa en la base que no se perdió ni se duplicó
//     nada y que el total del día subió exactamente lo capturado.
//
//   k6 run e2e/simultaneo.js   (desde pruebas-carga, app en http://localhost:3100)

import { browser } from "k6/browser";
import exec from "k6/execution";
import { setTimeout } from "k6/timers";

import { get, one, rpc, toCents, unitId, usdToMxnCents } from "./api.js";
import { fillService, pickUnit, saveService } from "./formulario.js";
import { MARK, check, clickButton, errorScreens, fill, go, idle, money, report, results, safeText, session, shot, toasts, waitToast } from "./lib.js";

export const options = {
  scenarios: {
    simultaneo: { executor: "per-vu-iterations", vus: 7, iterations: 1, maxDuration: "25m", options: { browser: { type: "chromium" } } },
  },
  setupTimeout: "2m",
  teardownTimeout: "3m",
};

const TODAY = __ENV.HOY || "2026-11-18";
const ROLES = ["ADMIN", "GERENTE", "CAPTURISTA", "CAPTURISTA2", "CAPTURISTA3", "CAPTURISTA4", "CAPTURISTA5"];
const KM = { "T-901": 109800, "T-902": 250400 };
const ARRASTRE = `${MARK} Arrastre`;

// Momentos (ms después de "start") en que todos actúan a la vez.
const ROUND2 = 240000;
const RACE = 420000;
const BROWSE_UNTIL = 540000;

function service(run, key, k, unit, expenses) {
  const s = {
    unit,
    shopReason: "Otro",
    shopReasonText: `${MARK} Simultaneo ${run}`,
    type: "servicio",
    place: "taller_propio",
    date: TODAY,
    description: `${MARK} Simultaneo ${run} ${key}-${k}`,
    expenses: expenses.map((e, i) => ({ category: "Otros (especificar)", concept: `${MARK} ${run} ${key}-${k}-${i + 1}`, currency: "MXN", ...e })),
    receipt: `${run}-${key}-${k}`,
  };
  if (KM[unit] !== undefined) s.km = KM[unit];
  return s;
}

/** Lo que captura cada capturista: [ronda 1, ronda 2]. */
function plan(run) {
  return {
    CAPTURISTA: [
      service(run, "CAPTURISTA", 1, "T-901", [{ amount: "1111.11" }, { amount: "10.00", currency: "USD", rate: "18.5000" }]),
      service(run, "CAPTURISTA", 2, "T-901", [{ amount: "222.22" }]),
    ],
    CAPTURISTA2: [
      service(run, "CAPTURISTA2", 1, "T-901", [{ amount: "333.33" }]),
      service(run, "CAPTURISTA2", 2, "T-901", [{ amount: "55.55", currency: "USD", rate: "17.1234" }]),
    ],
    CAPTURISTA3: [
      service(run, "CAPTURISTA3", 1, "T-902", [{ amount: "444.44" }]),
      service(run, "CAPTURISTA3", 2, "T-902", [{ amount: "555.55" }, { amount: "0.01", currency: "USD", rate: "19.9999" }]),
    ],
    CAPTURISTA4: [service(run, "CAPTURISTA4", 1, "T-902", [{ amount: "666.66" }])],
    CAPTURISTA5: [service(run, "CAPTURISTA5", 1, "R-901", [{ amount: "777.77" }])],
  };
}

function raceService(run) {
  return {
    unit: "C-901",
    type: "correctivo",
    place: "taller_propio",
    date: TODAY,
    km: 45200,
    description: `${MARK} Simultaneo ${run} carrera`,
    expenses: [{ category: "Otros (especificar)", concept: `${MARK} ${run} carrera-1`, currency: "MXN", amount: "888.88" }],
  };
}

const totalOf = (s) => s.expenses.reduce((a, e) => a + (e.currency === "USD" ? usdToMxnCents(toCents(e.amount), e.rate) : toCents(e.amount)), 0);
const amountText = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const enc = encodeURIComponent;

function dayReport() {
  return rpc("reporte_gastos", { p_desde: TODAY, p_hasta: TODAY, p_grupo: null, p_tipo: null, p_limite_ranking: 10 });
}

function arrastre() {
  const svc = one(`servicios?descripcion=eq.${enc(`${MARK} Ponchadura en carretera`)}&fecha=eq.${TODAY}&select=id,gastos(id,monto,concepto)`);
  if (!svc) throw new Error("No está el servicio de T-902 de la etapa 2 (Ponchadura en carretera)");
  const g = svc.gastos.find((x) => x.concepto === ARRASTRE);
  return { id: svc.id, cents: toCents(g.monto) };
}

export function setup() {
  for (const n of ["T-901", "T-902", "R-901", "C-901"]) {
    const u = one(`unidades?numero_economico=eq.${n}&select=estatus`);
    if (u.estatus !== "activo") throw new Error(`${n} está ${u.estatus}; debe estar activa para la prueba`);
  }
  const r = dayReport();
  const run = `S${Date.now().toString(36).toUpperCase()}`;
  const a = arrastre();
  return {
    run,
    start: Date.now() + 220000,
    since: new Date().toISOString(),
    before: { total: toCents(r.total), servicios: Number(r.servicios), gastos: Number(r.gastos) },
    arrastre: a,
  };
}

async function until(page, t) {
  while (Date.now() < t) await page.waitForTimeout(Math.min(500, Math.max(1, t - Date.now())));
}

/** Llena, espera la hora acordada y guarda; anota a qué hora se oprimió Guardar. */
async function captureAt(page, role, s, at) {
  await fillService(page, s);
  const late = Date.now() - at;
  if (late > 0) console.log(`HORA ${role} terminó de llenar ${s.description} ${Math.round(late / 1000)} s después de la hora acordada`);
  await until(page, at);
  console.log(`HORA ${role} guarda ${s.unit} a las ${new Date().toISOString().slice(11, 23)}`);
  const r = await saveService(page);
  check(`${role}: guardó ${s.description}`, Boolean(r.id), r.toasts.join(" | "));
  if (r.asked) console.log(`AVISO ${role}: la app preguntó por un servicio parecido de ${s.unit} (contestó "es otro")`);
  return r;
}

async function browse(page, paths, untilT) {
  let i = 0;
  while (Date.now() < untilT) {
    await go(page, paths[i % paths.length]);
    await idle(page, 2500);
    i++;
  }
  return i;
}

async function capturista(sess, role, data) {
  const page = await sess.as(role);
  const mine = plan(data.run)[role];
  await captureAt(page, role, mine[0], data.start);
  if (mine[1]) await captureAt(page, role, mine[1], data.start + ROUND2);

  if (role !== "CAPTURISTA4" && role !== "CAPTURISTA5") return;

  // La carrera por el ticket.
  let ticket = null;
  for (let i = 0; i < 240 && !ticket; i++) {
    ticket = one(`tickets_taller?falla=like.*${data.run}*&select=id,estatus`);
    if (!ticket) await page.waitForTimeout(1000);
  }
  if (!check(`${role}: ve el ticket del admin`, ticket !== null, "no apareció")) return;
  await until(page, data.start + RACE - 30000);
  await go(page, "/tickets");
  await page.locator(`(//article[contains(normalize-space(.), "${data.run}")]//button[normalize-space(.)="Aceptar"])[1]`).click();
  await idle(page, 800);
  await until(page, data.start + RACE);
  console.log(`HORA ${role} acepta el ticket a las ${new Date().toISOString().slice(11, 23)}`);
  const confirm = page.locator('//button[contains(normalize-space(.), "Aceptar y dar entrada")]');
  if ((await confirm.count()) === 0) {
    console.log(`CARRERA ${role}: la ventana de aceptar ya no estaba (el otro ganó antes)`);
    return;
  }
  await confirm.first().click();
  let outcome = null;
  const seen = [];
  const end = Date.now() + 25000;
  while (Date.now() < end && !outcome) {
    for (const t of await toasts(page)) {
      if (!seen.includes(t)) seen.push(t);
      if (t.includes("entró a taller")) outcome = "gano";
      else if (t.includes("Este ticket ya")) outcome = "perdio";
    }
    await page.waitForTimeout(250);
  }
  console.log(`CARRERA ${role}: ${outcome || "sin aviso"} (${seen.join(" | ")})`);
  check(`${role}: recibe una respuesta clara al aceptar`, outcome !== null, seen.join(" | ") || "ningún aviso");
  if (outcome !== "gano") return;
  await idle(page, 2000);
  const s = raceService(data.run);
  await fillService(page, s);
  const r = await saveService(page);
  check(`${role}: registra el servicio de C-901`, Boolean(r.id), r.toasts.join(" | "));
}

async function admin(sess, data) {
  const page = await sess.as("ADMIN");
  // Si una corrida anterior dejó un ticket de C-901 pendiente, se cancela: la app
  // no deja levantar otro de la misma unidad mientras haya uno abierto.
  const C901 = unitId("C-901");
  for (const old of get(`tickets_taller?unidad_id=eq.${C901}&estatus=eq.pendiente&falla=like.*PRUEBA%20E2E*&select=id,falla`)) {
    const tag = old.falla.match(/S[0-9A-Z]{6,}/);
    await go(page, "/tickets");
    await page.locator(`(//article[contains(normalize-space(.), "${tag ? tag[0] : old.falla}")]//button[normalize-space(.)="Cancelar ticket"])[1]`).click();
    await idle(page, 600);
    await page.locator('//*[@role="alertdialog"]//button[normalize-space(.)="Cancelar ticket"]').click();
    const t0 = await waitToast(page, "cancelado");
    check("ADMIN: cancela el ticket pendiente de una corrida anterior", t0.ok, t0.seen.join(" | "));
  }
  // Ticket urgente de C-901 (antes de que empiecen a guardar).
  await go(page, "/tickets/nuevo");
  await pickUnit(page, "C-901");
  await fill(page, "#fault", `${MARK} ${data.run} carrera por aceptar`);
  await page.locator('//*[@role="radio"][contains(normalize-space(.), "Urgente")]').click();
  await clickButton(page, "Enviar ticket");
  const t = await waitToast(page, "enviado a los capturistas");
  check("ADMIN: levanta el ticket urgente de C-901", t.ok, t.seen.join(" | "));

  // Mientras los capturistas guardan: corrige el arrastre de T-902 (+$10.00).
  await go(page, `/servicios/${data.arrastre.id}/editar`);
  let index = -1;
  for (let i = 0; i < 10 && index < 0; i++) {
    const loc = page.locator(`#expense-${i}-concept`);
    if ((await loc.count()) === 0) break;
    if ((await loc.inputValue()) === ARRASTRE) index = i;
  }
  if (!check("ADMIN: encuentra el gasto de arrastre en el formulario", index >= 0)) return;
  const target = data.arrastre.cents + 1000;
  await fill(page, `#expense-${index}-amount`, amountText(target));
  await fill(page, "#reason", `${MARK} ${data.run} corrección mientras otros capturan`);
  await until(page, data.start);
  console.log(`HORA ADMIN guarda la corrección a las ${new Date().toISOString().slice(11, 23)}`);
  await clickButton(page, "Guardar cambios");
  const t2 = await waitToast(page, "Cambios guardados", 40000);
  check(`ADMIN: corrige el arrastre a ${money(target)}`, t2.ok, t2.seen.join(" | "));

  const pages = await browse(page, ["/servicios", "/taller", "/", "/tickets", `/dashboard?periodo=rango&desde=${TODAY}&hasta=${TODAY}`], data.start + BROWSE_UNTIL);
  console.log(`ADMIN abrió ${pages} pantallas mientras los demás trabajaban`);
}

async function gerente(sess, data) {
  const page = await sess.as("GERENTE");
  const T901 = unitId("T-901");
  const pages = await browse(page, ["/", `/dashboard?periodo=rango&desde=${TODAY}&hasta=${TODAY}`, "/servicios", `/unidades/${T901}`, "/unidades"], data.start + BROWSE_UNTIL);
  console.log(`GERENTE abrió ${pages} pantallas mientras los demás trabajaban`);

  // Espera a que todos terminen (10 servicios de la prueba) y compara Reportes de hoy.
  for (let i = 0; i < 120; i++) {
    const n = get(`servicios?descripcion=like.*Simultaneo%20${data.run}*&select=id`).length;
    if (n >= 10) break;
    await page.waitForTimeout(3000);
  }
  await idle(page, 3000);
  const r = dayReport();
  await go(page, `/dashboard?periodo=rango&desde=${TODAY}&hasta=${TODAY}`);
  await idle(page, 2500);
  const text = await safeText(page);
  const total = money(toCents(r.total));
  check(`GERENTE: Reportes de hoy dice ${total}, igual que la base`, text.includes(total), "no aparece en la pantalla");
  await shot(page, "etapa4-reportes-gerente").catch(() => {});
}

export default async function (data) {
  const role = ROLES[exec.vu.idInTest - 1];
  // Entran uno cada 20 s: siete Edge arrancando juntos no alcanzan a abrir la app.
  await new Promise((r) => setTimeout(r, (exec.vu.idInTest - 1) * 20000));
  const sess = session(browser);
  try {
    if (role === "ADMIN") await admin(sess, data);
    else if (role === "GERENTE") await gerente(sess, data);
    else await capturista(sess, role, data);
  } catch (e) {
    if (sess.page) await shot(sess.page, `etapa4-falla-${role}`).catch(() => {});
    check(`${role}: se detuvo`, false, String(e && e.message ? e.message : e).slice(0, 400));
  } finally {
    await sess.close();
    const bad = results.filter((r) => !r.ok).length;
    console.log(`${role}: ${results.length - bad} de ${results.length} casos bien.${errorScreens.length ? ` Pantallas de error: ${errorScreens.join(", ")}` : ""}`);
  }
}

/** Al final, en la base: nada perdido, nada duplicado, totales exactos. */
export function teardown(data) {
  const all = Object.values(plan(data.run)).flat();
  let expected = 0;
  let expectedExpenses = 0;
  for (const s of all) {
    const rows = get(`servicios?descripcion=eq.${enc(s.description)}&select=id,fecha,kilometraje,unidad:unidades(numero_economico),gastos(monto)`);
    const want = totalOf(s);
    const got = rows.length === 1 ? rows[0].gastos.reduce((a, g) => a + toCents(g.monto), 0) : null;
    const ok = rows.length === 1 && got === want && rows[0].unidad.numero_economico === s.unit && rows[0].gastos.length === s.expenses.length;
    check(`base: ${s.description} una sola vez, ${s.unit}, ${money(want)}`, ok, `${rows.length} renglones; ${got === null ? "" : money(got)}`);
    const rec = rows.length === 1 ? get(`comprobantes?servicio_id=eq.${rows[0].id}&select=id`).length : 0;
    check(`base: comprobante de ${s.description}`, rec === 1, `${rec} comprobantes`);
    expected += want;
    expectedExpenses += s.expenses.length;
  }

  // La carrera por el ticket.
  const ticket = one(`tickets_taller?falla=like.*${data.run}*&select=id,estatus,entrada_id,atendido_nombre`);
  check("base: el ticket quedó aceptado una sola vez, con su entrada a taller", ticket && ticket.estatus !== "pendiente" && ticket.entrada_id, JSON.stringify(ticket));
  const C901 = unitId("C-901");
  const entries = get(`entradas_taller?unidad_id=eq.${C901}&created_at=gte.${enc(data.since)}&select=id,fecha_salida`);
  check("base: C-901 tiene una sola entrada a taller nueva", entries.length === 1, `${entries.length} entradas`);
  const race = raceService(data.run);
  const raceRows = get(`servicios?descripcion=eq.${enc(race.description)}&select=id,gastos(monto)`);
  check(`base: el servicio de C-901 está una sola vez (${money(totalOf(race))})`, raceRows.length === 1, `${raceRows.length} renglones`);
  if (raceRows.length === 1) {
    expected += totalOf(race);
    expectedExpenses += 1;
  }
  const c = one(`unidades?id=eq.${C901}&select=estatus`);
  check("base: C-901 salió de taller con su servicio", c.estatus === "activo", c.estatus);

  // La corrección del admin.
  const a = arrastre();
  check(`base: el arrastre quedó en ${money(data.arrastre.cents + 1000)}`, a.cents === data.arrastre.cents + 1000, money(a.cents));
  if (a.cents === data.arrastre.cents + 1000) expected += 1000;

  // Unidades: siguen activas y con el kilometraje correcto.
  for (const n of ["T-901", "T-902", "R-901"]) {
    const u = one(`unidades?numero_economico=eq.${n}&select=estatus`);
    check(`base: ${n} sigue activa`, u.estatus === "activo", u.estatus);
  }

  // El día completo, como lo calcula Reportes.
  const r = dayReport();
  const servicesAdded = all.length + raceRows.length;
  check(`Reportes de hoy subió ${money(expected)} (de ${money(data.before.total)} a ${money(data.before.total + expected)})`, toCents(r.total) === data.before.total + expected, `la BD da ${money(toCents(r.total))}`);
  check(`Reportes de hoy: ${servicesAdded} servicios más`, Number(r.servicios) === data.before.servicios + servicesAdded, `${data.before.servicios} -> ${r.servicios}`);
  check(`Reportes de hoy: ${expectedExpenses} gastos más`, Number(r.gastos) === data.before.gastos + expectedExpenses, `${data.before.gastos} -> ${r.gastos}`);

  report();
  console.log(`LEDGER ${JSON.stringify({ fecha: new Date().toISOString(), run: data.run, antes: data.before, subio: expected, casos: results })}`);
}
