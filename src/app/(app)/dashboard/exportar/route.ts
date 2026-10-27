import writeXlsxFile, { type Cell, type CellObject, type SheetData } from "write-excel-file/node";

import { getReport, listExportRows } from "@/features/dashboard/queries";
import { GROUP_LABELS, monthLongLabel, reportFiltersSchema, resolvePeriod } from "@/features/dashboard/schemas";
import { UNIT_TYPE_LABELS } from "@/features/unidades/types";
import { requireRole } from "@/lib/auth/get-current-user";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";
import { formatDate, formatDateTime, toCents, toRateUnits, todayInTijuana } from "@/lib/utils/format";

const MONEY = '"$"#,##0.00';
const USD = '"US$"#,##0.00';
const RATE = "0.0000";
const PERCENT = "0.0%";

/** "12345.67" → 12345.67 solo para la celda de Excel (el texto exacto viene de la BD). */
const money = (value: string): CellObject => ({ value: (toCents(value) ?? 0) / 100, type: Number, format: MONEY });
const date = (value: string): Cell => {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: "dd/mm/yyyy" };
};
const header = (...titles: string[]): Cell[] => titles.map((value) => ({ value, fontWeight: "bold" }));
const share = (part: string, total: number): Cell => ({
  value: total ? (toCents(part) ?? 0) / total : 0,
  type: Number,
  format: PERCENT,
});

/**
 * Excel del periodo filtrado (admin y gerente). Mismos filtros que Reportes; los
 * totales salen de la BD. Se genera al vuelo: no se guarda nada en Storage.
 */
export async function GET(request: Request) {
  await requireRole(VIEW_ALL_ROLES);

  const filters = reportFiltersSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const period = resolvePeriod(filters, todayInTijuana());

  const [report, rows] = await Promise.all([getReport(period, filters, 50), listExportRows(period, filters)]);
  const totalCents = toCents(report.total) ?? 0;

  const summary: SheetData = [
    [{ value: "Reporte de gastos de la flotilla", fontWeight: "bold" }],
    ["Periodo", `${period.label}: ${formatDate(period.from)} al ${formatDate(period.to)}`],
    ["Grupo", filters.grupo ? GROUP_LABELS[filters.grupo] : "Todos"],
    ["Tipo de unidad", filters.tipo ? UNIT_TYPE_LABELS[filters.tipo] : "Todos"],
    ["Total invertido", money(report.total)],
    ["Periodo anterior (mismo largo)", money(report.previousTotal)],
    ["Servicios", report.services],
    ["Gastos", report.expenses],
    ["Unidades con gastos", report.units],
    ["Generado", formatDateTime(new Date().toISOString())],
    rows.length === 50000 ? ["Aviso", "El detalle se cortó en 50,000 renglones; usa un periodo más corto."] : [],
  ];

  const expenses: SheetData = [
    header("Fecha", "Unidad", "Tipo", "Grupo", "Categoría", "Concepto", "Proveedor", "Descripción", "Monto", "Moneda", "Dólares", "Tipo de cambio"),
    ...rows.map((row): Cell[] => [
      date(row.date),
      row.economicNumber,
      UNIT_TYPE_LABELS[row.type],
      GROUP_LABELS[row.group] ?? "",
      row.category,
      row.concept ?? "",
      row.supplier,
      row.description ?? "",
      money(row.amount),
      row.currency,
      row.usdAmount ? { ...money(row.usdAmount), format: USD } : null,
      row.exchangeRate ? { value: (toRateUnits(row.exchangeRate) ?? 0) / 10000, type: Number, format: RATE } : null,
    ]),
    [null, null, null, null, null, null, null, { value: "Total", fontWeight: "bold" }, { ...money(report.total), fontWeight: "bold" }],
  ];

  const byUnit: SheetData = [
    header("Unidad", "Tipo", "Grupo", "Servicios", "Total", "% del total"),
    ...report.byUnit.map((u): Cell[] => [
      u.economicNumber,
      UNIT_TYPE_LABELS[u.type],
      GROUP_LABELS[u.group] ?? "",
      u.services,
      money(u.total),
      share(u.total, totalCents),
    ]),
  ];

  const byCategory: SheetData = [
    header("Categoría", "Gastos", "Total", "% del total"),
    ...report.byCategory.map((c): Cell[] => [c.name, c.expenses, money(c.total), share(c.total, totalCents)]),
  ];

  const byMonth: SheetData = [
    header("Mes", "Servicios", "Total"),
    ...report.byMonth.map((m): Cell[] => [monthLongLabel(m.month), m.services, money(m.total)]),
  ];

  const bySupplier: SheetData = [
    header("Proveedor o taller", "Servicios", "Total", "% del total"),
    ...report.bySupplier.map((p): Cell[] => [p.name, p.services, money(p.total), share(p.total, totalCents)]),
  ];

  const buffer = await writeXlsxFile([
    { data: summary, sheet: "Resumen", columns: [{ width: 32 }, { width: 48 }] },
    {
      data: expenses,
      sheet: "Gastos",
      columns: [{ width: 12 }, { width: 10 }, { width: 14 }, { width: 12 }, { width: 34 }, { width: 30 }, { width: 26 }, { width: 40 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 14 }],
    },
    { data: byUnit, sheet: "Por unidad", columns: [{ width: 10 }, { width: 14 }, { width: 12 }, { width: 11 }, { width: 16 }, { width: 12 }] },
    { data: byCategory, sheet: "Por categoría", columns: [{ width: 40 }, { width: 10 }, { width: 16 }, { width: 12 }] },
    { data: byMonth, sheet: "Por mes", columns: [{ width: 22 }, { width: 11 }, { width: 16 }] },
    { data: bySupplier, sheet: "Por proveedor", columns: [{ width: 34 }, { width: 11 }, { width: 16 }, { width: 12 }] },
  ]).toBuffer();

  const fileName = `reporte-gastos_${period.from}_a_${period.to}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
