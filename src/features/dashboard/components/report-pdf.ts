import { jsPDF } from "jspdf";

import { serviceTypeLabel } from "@/features/servicios/types";
import { UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { formatCents, formatDate, formatDateTime, formatMoney, formatUsd, toCents } from "@/lib/utils/format";

import type { ReportPdfData } from "../actions";
import { GROUPS, GROUP_LABELS, monthLabel } from "../schemas";

/**
 * Reporte en PDF armado en el navegador con jsPDF (se carga solo al pedirlo).
 * Lo usa el iPhone con la app en la pantalla de inicio, donde iOS no tiene cuadro
 * de impresión. Mismo contenido que la hoja impresa: encabezado, cifras clave,
 * gasto por mes, grupos y tipos, y las listas completas. Hoja carta vertical.
 */

const INK = "#10313a";
const CYAN = "#0b7fb0";
const MUTED = "#4f6870";
const RAIL = "#e6eff1";
const BORDER = "#d3dfe2";
const GROUP_COLORS = { local: "#7ab648", foraneo: "#0b7fb0", camionetas: "#eb6834" } as const;

const PAGE_W = 215.9;
const PAGE_H = 279.4;
const M = 14; // margen
const W = PAGE_W - M * 2;

const percent = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });
const percent0 = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("es-MX");

/** Las fuentes base del PDF solo traen Latin-1: lo demás (emojis, etc.) sale como "?". */
const clean = (value: string) =>
  value.normalize("NFC").replace(/ | /g, " ").replace(/[^\x20-\x7e¡-ÿ–—…]/g, "?");

const compact = (pesos: number) =>
  pesos >= 999_500
    ? `$${(pesos / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} M`
    : pesos >= 1_000
      ? `$${Math.round(pesos / 1_000).toLocaleString("es-MX")} mil`
      : `$${pesos}`;

function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch("/brand/logo.png");
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

type Ranked = { label: string; detail?: string; total: string };

export async function buildReportPdf({ report, period, filters }: ReportPdfData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
  const logo = await loadLogo();
  let y = M;

  const font = (size: number, style: "normal" | "bold" = "normal", color = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };
  const text = (value: string, x: number, yy: number, align: "left" | "right" | "center" = "left") =>
    doc.text(clean(value), x, yy, { align, baseline: "alphabetic" });
  /** Recorta con "…" lo que no cabe (nombres largos sin espacios). */
  const fit = (value: string, maxWidth: number) => {
    let out = clean(value);
    if (doc.getTextWidth(out) <= maxWidth) return out;
    while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxWidth) out = out.slice(0, -1);
    return `${out}…`;
  };
  const ensure = (height: number) => {
    if (y + height > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
  };
  const sectionTitle = (title: string, description?: string) => {
    // Título, descripción y al menos un renglón juntos en la misma hoja.
    ensure(30);
    y += 8;
    font(13, "bold");
    text(title, M, y);
    y += 5;
    if (description) {
      font(9, "normal", MUTED);
      text(description, M, y);
      y += 4;
    }
    y += 3;
  };

  // Encabezado
  const details = [
    `${period.label}: ${formatDate(period.from)} al ${formatDate(period.to)}`,
    filters.grupo ? GROUP_LABELS[filters.grupo] : "Todos los grupos",
    filters.tipo ? UNIT_TYPE_LABELS[filters.tipo] : "Todos los tipos",
  ].join(" · ");
  const logoW = 36;
  const titleW = logo ? W - logoW - 6 : W;
  font(17, "bold");
  text("Reporte de gastos de la flotilla", M, y + 6);
  font(9.5);
  const detailLines = doc.splitTextToSize(clean(details), titleW) as string[];
  detailLines.forEach((line, i) => doc.text(line, M, y + 12 + i * 4.2));
  font(8, "normal", MUTED);
  text(`Generado el ${formatDateTime(new Date().toISOString())}`, M, y + 12 + detailLines.length * 4.2 + 0.5);
  if (logo) doc.addImage(logo, "PNG", PAGE_W - M - logoW, y, logoW, (logoW * 141) / 397);
  y += 14 + detailLines.length * 4.2 + 2;
  doc.setDrawColor(INK);
  doc.setLineWidth(0.6);
  doc.line(M, y, PAGE_W - M, y);
  y += 6;

  // Cifras clave: total (fondo tinta) y dos datos de apoyo; franja de dólares abajo.
  const totalCents = toCents(report.total) ?? 0;
  const prevCents = toCents(report.previousTotal) ?? 0;
  const prevRange = report.previousFrom ? ` (${formatDate(report.previousFrom)} al ${formatDate(report.previousTo)})` : "";
  let delta: string;
  if (prevCents === 0) delta = `Sin gastos en el periodo anterior${prevRange} para comparar.`;
  else {
    const change = (totalCents - prevCents) / prevCents;
    delta =
      totalCents === prevCents || Math.abs(change) < 0.005
        ? `Casi igual que el periodo anterior${prevRange}: ${formatMoney(report.previousTotal)}`
        : `${percent0.format(Math.abs(change))} ${change > 0 ? "más" : "menos"} que el periodo anterior${prevRange}: ${formatMoney(report.previousTotal)}`;
  }
  const kpiH = 34;
  const totalW = W / 2;
  const sideW = W / 4;
  doc.setFillColor(INK);
  doc.rect(M, y, totalW, kpiH, "F");
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, y, W, kpiH + 13, "S");
  doc.line(M + totalW + sideW, y, M + totalW + sideW, y + kpiH);
  doc.line(M + totalW, y + kpiH, PAGE_W - M, y + kpiH);
  font(9, "normal", "#c9d6d9");
  text(`Total invertido · ${period.label}`, M + 5, y + 7);
  font(22, "bold", "#ffffff");
  text(formatMoney(report.total), M + 5, y + 17);
  font(8, "normal", "#dbe5e7");
  (doc.splitTextToSize(clean(delta), totalW - 10) as string[]).slice(0, 3).forEach((line, i) => doc.text(line, M + 5, y + 23 + i * 3.6));

  const perUnit = report.units ? Math.round(totalCents / report.units) : 0;
  const side = [
    { x: M + totalW, label: "Servicios", value: count.format(report.services), sub: `${count.format(report.expenses)} gastos` },
    {
      x: M + totalW + sideW,
      label: "Promedio por unidad",
      value: formatCents(perUnit),
      sub: `${count.format(report.units)} ${report.units === 1 ? "unidad" : "unidades"} con gastos`,
    },
  ];
  for (const s of side) {
    font(8.5, "normal", MUTED);
    text(s.label, s.x + 4, y + 7);
    font(15, "bold");
    text(fit(s.value, sideW - 8), s.x + 4, y + 16);
    font(8, "normal", MUTED);
    text(fit(s.sub, sideW - 8), s.x + 4, y + 22);
  }
  font(8.5, "normal", MUTED);
  text("Pagado en dólares", M + 5, y + kpiH + 8);
  font(12, "bold");
  const usdAmount = formatUsd(report.usd.amount);
  text(usdAmount, M + 36, y + kpiH + 8.3);
  const noteX = M + 36 + doc.getTextWidth(usdAmount) + 5;
  font(8, "normal", MUTED);
  const usdNote = report.usd.expenses
    ? `Equivale a ${formatMoney(report.usd.mxn)} en ${count.format(report.usd.expenses)} ${report.usd.expenses === 1 ? "gasto" : "gastos"}, ya sumado al total`
    : "Sin gastos en dólares en el periodo";
  text(fit(usdNote, PAGE_W - M - 4 - noteX), noteX, y + kpiH + 8);
  y += kpiH + 13 + 4;

  // Gasto por mes: columnas en cian, eje con tres marcas, monto solo en el mes más alto.
  sectionTitle("Gasto por mes", `${formatDate(period.from)} al ${formatDate(period.to)}`);
  {
    const chartH = 42;
    ensure(chartH + 12);
    const cents = report.byMonth.map((m) => toCents(m.total) ?? 0);
    const top = niceMax(Math.max(...cents, 0) / 100);
    const peak = cents.indexOf(Math.max(...cents));
    const axisW = 16;
    const x0 = M + axisW;
    const plotW = W - axisW;
    const base = y + 4 + chartH;
    font(7, "normal", MUTED);
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.2);
    for (const t of [1, 0.5, 0]) {
      const ty = base - chartH * t;
      doc.line(x0, ty, PAGE_W - M, ty);
      text(compact(top * t), x0 - 2, ty + 1, "right");
    }
    const slot = plotW / Math.max(cents.length, 1);
    const barW = Math.min(slot * 0.6, 8);
    report.byMonth.forEach((m, i) => {
      const h = ((cents[i] ?? 0) / 100 / top) * chartH;
      const cx = x0 + slot * i + slot / 2;
      if (h > 0) {
        doc.setFillColor(CYAN);
        doc.rect(cx - barW / 2, base - h, barW, h, "F");
      }
      font(cents.length > 14 ? 5.5 : 7, "normal", MUTED);
      text(monthLabel(m.month), cx, base + 4, "center");
      if (i === peak && (cents[i] ?? 0) > 0) {
        font(7, "bold");
        const label = formatMoney(m.total);
        const half = doc.getTextWidth(label) / 2;
        const lx = Math.min(Math.max(cx, x0 + half), PAGE_W - M - half);
        text(label, lx, base - h - 1.5, "center");
      }
    });
    y = base + 8;
  }

  // Lista ordenada con barra: nombre (y detalle), monto y parte del total.
  const grand = totalCents || 1;
  const ranked = (items: Ranked[]) => {
    if (items.length === 0) {
      font(9, "normal", MUTED);
      text("Sin gastos en este periodo.", M, y + 4);
      y += 8;
      return;
    }
    const max = Math.max(...items.map((item) => toCents(item.total) ?? 0), 1);
    for (const item of items) {
      ensure(10);
      const cents = toCents(item.total) ?? 0;
      font(9, "bold");
      const amount = formatMoney(item.total);
      const share = percent.format(cents / grand);
      const rightW = doc.getTextWidth(amount) + 16;
      text(amount, PAGE_W - M - 16, y + 3.5, "right");
      font(8, "normal", MUTED);
      text(share, PAGE_W - M, y + 3.5, "right");
      const labelMax = W - rightW - 4;
      font(9, "bold");
      const label = fit(item.label, labelMax);
      text(label, M, y + 3.5);
      if (item.detail) {
        const used = doc.getTextWidth(label);
        font(8, "normal", MUTED);
        const room = labelMax - used - 2;
        if (room > 8) text(fit(` · ${item.detail}`, room), M + used, y + 3.5);
      }
      doc.setFillColor(RAIL);
      doc.rect(M, y + 5.2, W, 1.6, "F");
      doc.setFillColor(CYAN);
      doc.rect(M, y + 5.2, (cents / max) * W, 1.6, "F");
      y += 9.5;
    }
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  // Por grupo y tipo
  sectionTitle("Por grupo y tipo", "Parte del total.");
  {
    ensure(28);
    const parts = GROUPS.map((group) => {
      const row = report.byGroup.find((g) => g.group === group);
      return { group, total: row?.total ?? "0", cents: toCents(row?.total ?? "0") ?? 0 };
    });
    let x = M;
    const visible = parts.filter((p) => p.cents > 0);
    visible.forEach((part, i) => {
      const w = (part.cents / grand) * W - (i < visible.length - 1 ? 0.6 : 0);
      doc.setFillColor(GROUP_COLORS[part.group]);
      doc.rect(x, y, Math.max(w, 0.1), 5, "F");
      x += w + (i < visible.length - 1 ? 0.6 : 0);
    });
    y += 9;
    for (const part of parts) {
      doc.setFillColor(GROUP_COLORS[part.group]);
      doc.rect(M, y - 2.6, 3, 3, "F");
      font(9, "bold");
      text(GROUP_LABELS[part.group], M + 5, y);
      text(formatMoney(part.total), PAGE_W - M - 16, y, "right");
      font(8, "normal", MUTED);
      text(percent.format(part.cents / grand), PAGE_W - M, y, "right");
      y += 5.5;
    }
    y += 3;
    ranked(report.byType.map((t) => ({ label: UNIT_TYPE_LABELS[t.type], total: t.total })));
  }

  sectionTitle("Por categoría", "En qué se va el dinero.");
  ranked(report.byCategory.map((c) => ({ label: c.name, detail: plural(c.expenses, "gasto", "gastos"), total: c.total })));

  sectionTitle("Unidades con más gasto");
  ranked(
    report.byUnit.map((u) => ({
      label: u.economicNumber,
      detail: `${UNIT_TYPE_LABELS[u.type]} · ${GROUP_LABELS[u.group] ?? ""}`,
      total: u.total,
    })),
  );

  sectionTitle("Por tipo de servicio", "Preventivo, correctivo o servicio.");
  ranked(
    report.byServiceType.map((t) => ({
      label: serviceTypeLabel(t.type),
      detail: `${plural(t.services, "servicio", "servicios")}${t.type ? "" : " de antes"}`,
      total: t.total,
    })),
  );

  sectionTitle("Proveedores y talleres", "Dónde se hacen los servicios.");
  ranked(report.bySupplier.map((p) => ({ label: p.name, detail: plural(p.services, "servicio", "servicios"), total: p.total })));

  // Número de página al pie.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    font(7.5, "normal", MUTED);
    text(`Página ${i} de ${pages}`, PAGE_W - M, PAGE_H - 7, "right");
  }

  return doc.output("blob");
}
