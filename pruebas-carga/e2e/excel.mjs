// 5L etapa 3: el Excel de Reportes contra un cálculo aparte (D26).
//
// Entra como admin y como gerente, descarga el Excel de un periodo, lo abre
// (un .xlsx es un zip con XML: se lee aquí mismo, sin librerías) y compara:
// renglones y suma de la hoja de gastos, el "Total", y los totales por unidad,
// contra los gastos de la base sumados en centavos.
//
//   node pruebas-carga/e2e/excel.mjs   (app en http://localhost:3100)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(here, "..", ".env.k6"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const BASE = process.env.BASE_URL || "http://localhost:3100";
const PERIODS = [
  { name: "noviembre 2026", from: "2026-11-01", to: process.env.HOY || "2026-11-18" },
  { name: "octubre 2026", from: "2026-10-01", to: "2026-10-31" },
];

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "BIEN " : "FALLA"} ${name}${!ok && detail ? ` -> ${detail}` : ""}`);
  return ok;
}

const cents = (v) => {
  const [w, f = ""] = String(v).split(".");
  const sign = w.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(parseInt(w, 10)) * 100 + parseInt((f + "00").slice(0, 2), 10));
};
const money = (c) => `$${Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(c % 100).padStart(2, "0")}`;

async function login(key) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email: env[`K6_${key}_EMAIL`], password: env[`K6_${key}_PASSWORD`] }),
  });
  if (!res.ok) throw new Error(`No se pudo entrar como ${key}: ${res.status}`);
  const body = await res.text();
  const session = JSON.parse(body);
  const ref = new URL(env.SUPABASE_URL).hostname.split(".")[0];
  const value = `base64-${Buffer.from(body).toString("base64url")}`;
  const name = `sb-${ref}-auth-token`;
  const CHUNK = 3180;
  const cookie =
    value.length <= CHUNK
      ? `${name}=${value}`
      : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => `${name}.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`).join("; ");
  return { cookie, token: session.access_token };
}

async function api(token, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Lee las entradas de un zip (método 0 o 8) usando el directorio central. */
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + size);
    files[name] = (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Hojas del libro: { nombre: [[celdas]] } con números como texto tal cual. */
function readWorkbook(files) {
  const shared = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const rels = Object.fromEntries([...files["xl/_rels/workbook.xml.rels"].matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = {};
  for (const tag of files["xl/workbook.xml"].match(/<sheet [^>]*\/>/g)) {
    const m = [null, tag.match(/name="([^"]+)"/)[1], tag.match(/r:id="([^"]+)"/)[1]];
    const target = rels[m[2]].replace(/^\/?(xl\/)?/, "");
    const xml = files[`xl/${target}`];
    const rows = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = c[1].split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const attrs = c[2];
        const inner = c[3] || "";
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        const inline = (inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
        let value = v ?? (inline !== undefined ? decode(inline) : null);
        if (/t="s"/.test(attrs) && v !== undefined) value = shared[Number(v)];
        row[col] = value;
      }
      rows.push(row);
    }
    sheets[decode(m[1])] = rows;
  }
  return sheets;
}

/** Número de Excel (float) a centavos, redondeando. */
const xlCents = (v) => Math.round(Number(v) * 100);

const admin = await login("ADMIN");
for (const p of PERIODS) {
  // Cálculo aparte desde la base.
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await api(admin.token, `gastos?select=monto,servicio:servicios!inner(fecha,unidad:unidades!inner(numero_economico))&servicio.fecha=gte.${p.from}&servicio.fecha=lte.${p.to}&order=id&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const total = rows.reduce((a, g) => a + cents(g.monto), 0);
  const byUnit = new Map();
  for (const g of rows) {
    const n = g.servicio.unidad.numero_economico;
    byUnit.set(n, (byUnit.get(n) || 0) + cents(g.monto));
  }

  for (const key of ["ADMIN", "GERENTE"]) {
    const who = key === "ADMIN" ? "admin" : "gerente";
    const { cookie } = key === "ADMIN" ? admin : await login(key);
    const res = await fetch(`${BASE}/dashboard/exportar?periodo=rango&desde=${p.from}&hasta=${p.to}`, { headers: { Cookie: cookie }, redirect: "manual" });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!check(`${who} descarga el Excel de ${p.name}`, res.status === 200 && buf.readUInt32LE(0) === 0x04034b50, `respuesta ${res.status}`)) continue;
    const files = unzip(buf);
    const book = readWorkbook(files);
    const names = Object.keys(book);
    const expensesName = names.find((n) => /gasto/i.test(n)) || names[1];
    const sheet = book[expensesName];
    const head = sheet.findIndex((r) => r && r.includes("Monto"));
    const amountCol = sheet[head].indexOf("Monto");
    const lines = sheet.slice(head + 1).filter((r) => r && r[0] && /^\d|^[0-9]{4}/.test(String(r[0])));
    const sum = lines.reduce((a, r) => a + xlCents(r[amountCol]), 0);
    const totalRow = sheet.find((r) => r && r.includes("Total"));
    const totalCell = totalRow ? xlCents(totalRow[totalRow.indexOf("Total") + 1]) : null;
    check(`Excel ${who} ${p.name}: ${rows.length} renglones de gastos`, lines.length === rows.length, `el Excel trae ${lines.length}`);
    check(`Excel ${who} ${p.name}: suma de la columna Monto ${money(total)}`, sum === total, `el Excel suma ${money(sum)}`);
    check(`Excel ${who} ${p.name}: renglón Total ${money(total)}`, totalCell === total, `el Excel dice ${totalCell === null ? "sin Total" : money(totalCell)}`);
    const unitName = names.find((n) => /unidad/i.test(n));
    if (unitName) {
      const us = book[unitName];
      const h = us.findIndex((r) => r && r.includes("Unidad"));
      const tCol = us[h].indexOf("Total");
      let bad = [];
      for (const r of us.slice(h + 1)) {
        if (!r || !r[0] || !byUnit.has(r[0])) continue;
        if (xlCents(r[tCol]) !== byUnit.get(r[0])) bad.push(`${r[0]}: Excel ${money(xlCents(r[tCol]))}, aparte ${money(byUnit.get(r[0]))}`);
      }
      check(`Excel ${who} ${p.name}: hoja por unidad`, bad.length === 0, bad.slice(0, 3).join("; "));
    }
  }
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} de ${results.length} casos bien.`);
