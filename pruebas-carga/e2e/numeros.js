// 5L etapa 3: los números de la app contra un cálculo aparte (D26).
//
// 1. Lee de la base cada gasto del periodo (renglón por renglón) y calcula aparte,
//    en centavos, todo lo que muestra Reportes: total, por mes y tipo de servicio,
//    categoría, unidad, grupo, tipo, dónde se hizo, taller, proveedor y dólares.
// 2. Lo compara con la función de la BD que usa Reportes (reporte_gastos).
// 3. Abre Reportes como admin y como gerente y busca esas cifras en la pantalla.
// 4. Abre la ficha y la lista de Gastos de las unidades de prueba.
//
//   k6 run e2e/numeros.js   (desde pruebas-carga, app en http://localhost:3100)

import { browser } from "k6/browser";

import { get, rpc, toCents } from "./api.js";
import { BASE, check, go, money, report, results, safeText, session } from "./lib.js";

export const options = {
  scenarios: { numeros: { executor: "shared-iterations", vus: 1, iterations: 1, maxDuration: "20m", options: { browser: { type: "chromium" } } } },
};

const PERIODS = [
  { name: "noviembre 2026", from: "2026-11-01", to: __ENV.HOY || "2026-11-18" },
  { name: "octubre 2026", from: "2026-10-01", to: "2026-10-31" },
];
const TEST_UNITS = ["T-901", "T-902", "R-901", "C-901"];

/** Todos los gastos de un periodo, de 1000 en 1000. */
function rawExpenses(from, to) {
  const select =
    "id,monto,moneda,monto_usd,categoria_id,categoria:categorias(nombre)," +
    "servicio:servicios!inner(id,fecha,tipo,lugar,taller_id,proveedor_id,unidad_id," +
    "unidad:unidades!inner(numero_economico,tipo,operacion,tipo_info:tipos_unidad(lleva_operacion)))";
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = get(`gastos?select=${select}&servicio.fecha=gte.${from}&servicio.fecha=lte.${to}&order=id&limit=1000&offset=${offset}`);
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

function groupOf(u) {
  return u.tipo_info && u.tipo_info.lleva_operacion === false ? "camionetas" : u.operacion;
}

function add(map, key, cents, extra) {
  const cur = map.get(key) || { total: 0, services: new Set(), count: 0 };
  cur.total += cents;
  cur.count += 1;
  if (extra) cur.services.add(extra);
  map.set(key, cur);
}

/** El reporte calculado aparte. */
function expected(rows) {
  const e = {
    total: 0,
    expenses: rows.length,
    services: new Set(),
    units: new Set(),
    usd: { usd: 0, mxn: 0, count: 0 },
    byMonth: new Map(),
    byMonthKind: new Map(),
    byCategory: new Map(),
    byUnit: new Map(),
    byGroup: new Map(),
    byType: new Map(),
    byServiceType: new Map(),
    byPlace: new Map(),
    byWorkshop: new Map(),
    bySupplier: new Map(),
  };
  for (const g of rows) {
    const c = toCents(g.monto);
    const s = g.servicio;
    e.total += c;
    e.services.add(s.id);
    e.units.add(s.unidad_id);
    if (g.moneda === "USD") {
      e.usd.usd += toCents(g.monto_usd);
      e.usd.mxn += c;
      e.usd.count += 1;
    }
    const month = s.fecha.slice(0, 7);
    add(e.byMonth, month, c, s.id);
    add(e.byMonthKind, `${month}|${s.tipo || "sin_tipo"}`, c, s.id);
    add(e.byCategory, g.categoria_id || "null", c, s.id);
    add(e.byUnit, s.unidad_id, c, s.id);
    add(e.byGroup, groupOf(s.unidad), c, s.id);
    add(e.byType, s.unidad.tipo, c, s.id);
    add(e.byServiceType, s.tipo || "null", c, s.id);
    add(e.byPlace, s.lugar || "null", c, s.id);
    if (s.taller_id) add(e.byWorkshop, s.taller_id, c, s.id);
    add(e.bySupplier, s.proveedor_id || "null", c, s.id);
  }
  return e;
}

/** Compara una lista de la BD contra el cálculo aparte; regresa cuántas no cuadraron. */
function compareList(label, list, keyOf, map, opts = {}) {
  let bad = 0;
  const shown = [];
  for (const item of list || []) {
    const key = keyOf(item);
    const exp = map.get(key);
    const got = toCents(item.total);
    if (!exp || exp.total !== got) {
      bad++;
      if (shown.length < 3) shown.push(`${key}: BD ${money(got)}, aparte ${exp ? money(exp.total) : "no existe"}`);
    } else if (opts.services && item.servicios !== undefined && Number(item.servicios) !== exp.services.size) {
      bad++;
      if (shown.length < 3) shown.push(`${key}: ${item.servicios} servicios, aparte ${exp.services.size}`);
    }
  }
  if (opts.complete) {
    const keys = new Set((list || []).map(keyOf));
    for (const k of map.keys()) {
      if (!keys.has(k)) {
        bad++;
        if (shown.length < 3) shown.push(`${k}: falta en la BD (aparte ${money(map.get(k).total)})`);
      }
    }
  }
  check(`${label}: ${(list || []).length} renglones cuadran`, bad === 0, shown.join("; "));
  return bad;
}

function compareReport(p, e, r) {
  const tag = `Reportes ${p.name}`;
  check(`${tag}: total ${money(e.total)}`, toCents(r.total) === e.total, `la BD da ${money(toCents(r.total))}`);
  check(`${tag}: ${e.services.size} servicios`, Number(r.servicios) === e.services.size, String(r.servicios));
  check(`${tag}: ${e.expenses} gastos`, Number(r.gastos) === e.expenses, String(r.gastos));
  check(`${tag}: ${e.units.size} unidades`, Number(r.unidades) === e.units.size, String(r.unidades));
  const d = r.dolares || {};
  check(
    `${tag}: dólares US$${(e.usd.usd / 100).toFixed(2)} = ${money(e.usd.mxn)} en ${e.usd.count} gastos`,
    toCents(d.usd || "0") === e.usd.usd && toCents(d.mxn || "0") === e.usd.mxn && Number(d.gastos || 0) === e.usd.count,
    JSON.stringify(d),
  );
  compareList(`${tag} por mes`, r.por_mes, (m) => String(m.mes).slice(0, 7), e.byMonth, { complete: true, services: true });
  for (const m of r.por_mes || []) {
    const month = String(m.mes).slice(0, 7);
    let bad = [];
    for (const kind of ["correctivo", "preventivo", "servicio", "sin_tipo"]) {
      const exp = (e.byMonthKind.get(`${month}|${kind}`) || { total: 0 }).total;
      if (toCents(m[kind] || "0") !== exp) bad.push(`${kind}: BD ${m[kind]}, aparte ${money(exp)}`);
    }
    check(`${tag} gráfica por tipo de servicio ${month}`, bad.length === 0, bad.join("; "));
  }
  compareList(`${tag} por categoría`, r.por_categoria, (c) => c.id || "null", e.byCategory, { complete: true });
  compareList(`${tag} por unidad (todas)`, r.por_unidad, (u) => u.id, e.byUnit, { complete: true, services: true });
  compareList(`${tag} por grupo`, r.por_grupo, (g) => g.grupo, e.byGroup, { complete: true });
  compareList(`${tag} por tipo de unidad`, r.por_tipo, (t) => t.tipo, e.byType, { complete: true });
  compareList(`${tag} por tipo de servicio`, r.por_tipo_servicio, (t) => t.tipo || "null", e.byServiceType, { complete: true, services: true });
  compareList(`${tag} dónde se hizo`, r.por_lugar, (l) => l.lugar || "null", e.byPlace, { complete: true, services: true });
  compareList(`${tag} talleres de fuera`, r.por_taller, (t) => t.id, e.byWorkshop, { services: true });
  compareList(`${tag} proveedores`, r.por_proveedor, (s) => s.id || "null", e.bySupplier, { services: true });
}

/** Busca en la pantalla de Reportes las cifras principales. */
async function checkScreen(page, who, p, e, r) {
  await go(page, `/dashboard?periodo=rango&desde=${p.from}&hasta=${p.to}`);
  await page.waitForTimeout(2500);
  // Como una persona: abre los "Ver las otras N" para ver las listas completas.
  const opened = await page.evaluate(() => {
    const closed = [...document.querySelectorAll("details:not([open])")];
    closed.forEach((d) => d.querySelector("summary") && d.querySelector("summary").click());
    return closed.length;
  });
  await page.waitForTimeout(800);
  const text = await safeText(page);
  const tag = `${who} ve Reportes ${p.name}`;
  check(`${tag}: se abrieron ${opened} listas de "Ver las otras"`, true);
  check(`${tag}: total ${money(e.total)}`, text.includes(money(e.total)), text.includes(money(e.total)) ? "" : "no aparece en la pantalla");
  const missing = [];
  const lists = [
    ["categoría", r.por_categoria],
    ["dónde se hizo", r.por_lugar],
    ["tipo de servicio", r.por_tipo_servicio],
    ["grupo", r.por_grupo],
  ];
  for (const [label, list] of lists) {
    for (const item of list || []) {
      const m = money(toCents(item.total));
      if (!text.includes(m)) missing.push(`${label} ${item.nombre || item.lugar || item.tipo || item.grupo || "sin dato"} ${m}`);
    }
  }
  check(`${tag}: cifras de categorías, lugares, tipos y grupos`, missing.length === 0, missing.slice(0, 6).join("; "));
  return text;
}

export default async function () {
  const sess = session(browser);
  const summary = { periods: [] };
  try {
    for (const p of PERIODS) {
      const rows = rawExpenses(p.from, p.to);
      const e = expected(rows);
      const r = rpc("reporte_gastos", { p_desde: p.from, p_hasta: p.to, p_grupo: null, p_tipo: null, p_limite_ranking: 1000 });
      compareReport(p, e, r);
      // La pantalla pide el ranking de 10: también esa versión.
      const r10 = rpc("reporte_gastos", { p_desde: p.from, p_hasta: p.to, p_grupo: null, p_tipo: null, p_limite_ranking: 10 });
      const top = [...e.byUnit.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([, v]) => v.total);
      const got = (r10.por_unidad || []).map((u) => toCents(u.total));
      check(`Reportes ${p.name}: las 10 unidades con más gasto`, JSON.stringify(top) === JSON.stringify(got), `BD ${got.map(money).join(", ")}`);

      const admin = await sess.as("ADMIN");
      const adminText = await checkScreen(admin, "admin", p, e, r);
      const manager = await sess.as("GERENTE");
      const managerText = await checkScreen(manager, "gerente", p, e, r);
      check(`gerente ve el mismo total que el admin (${p.name})`, adminText.includes(money(e.total)) === managerText.includes(money(e.total)));
      summary.periods.push({ ...p, total: e.total, expenses: e.expenses, services: e.services.size, usd: e.usd });
    }

    // El gerente solo ve: las pantallas de captura lo regresan y no ve botones para cambiar.
    const manager = await sess.as("GERENTE");
    const anyService = get("servicios?select=id,unidad:unidades!inner(notas)&unidad.notas=like.*PRUEBA%20E2E*&fecha=gte.2026-11-01&limit=1")[0];
    for (const path of ["/servicios/nuevo", "/taller/entrada", "/unidades/nueva", `/servicios/${anyService.id}/editar`, "/admin/usuarios", "/admin/catalogos"]) {
      await go(manager, path);
      const where = manager.url().replace(BASE, "").split("?")[0];
      check(`gerente no puede abrir ${path.replace(anyService.id, "<id>")}`, where !== path, `se quedó en ${where}`);
    }
    await go(manager, `/servicios/${anyService.id}`);
    const detail = await safeText(manager);
    const buttons = ["Editar", "Eliminar", "Subir comprobante", "Elegir archivo"].filter((b) => detail.includes(b));
    check("gerente no ve botones para cambiar un servicio", buttons.length === 0, `ve: ${buttons.join(", ")}`);

    // Ficha y lista de Gastos de cada unidad de prueba (todo su historial).
    const admin = await sess.as("ADMIN");
    for (const number of TEST_UNITS) {
      const unit = get(`unidades?numero_economico=eq.${number}&select=id`)[0];
      const rows = get(`gastos?select=monto,servicio:servicios!inner(id,unidad_id)&servicio.unidad_id=eq.${unit.id}&limit=1000`);
      const total = rows.reduce((a, g) => a + toCents(g.monto), 0);
      const services = new Set(rows.map((g) => g.servicio.id)).size;
      await go(admin, `/unidades/${unit.id}`);
      await admin.waitForTimeout(1500);
      const ficha = await safeText(admin);
      check(`ficha de ${number}: total ${money(total)} (${services} servicios, ${rows.length} gastos)`, ficha.includes(money(total)), ficha.includes(money(total)) ? "" : "no aparece en la ficha");
      await go(admin, `/servicios?q=${number}`);
      await admin.waitForTimeout(1500);
      const list = await safeText(admin);
      check(`Gastos filtrado por ${number}: total ${money(total)}`, list.includes(money(total)), list.includes(money(total)) ? "" : "no aparece en la lista");
      summary[number] = { total, services, expenses: rows.length };
    }
  } finally {
    await sess.close();
    report();
    console.log(`LEDGER ${JSON.stringify({ fecha: new Date().toISOString(), casos: results, ...summary })}`);
  }
}
