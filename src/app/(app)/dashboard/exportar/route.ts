import writeXlsxFile, { type Cell, type CellObject, type SheetData } from "write-excel-file/node";

import { getMonthLock } from "@/features/cierres/queries";
import { getReport, listExportRows } from "@/features/dashboard/queries";
import { GROUP_LABELS, monthLongLabel, reportFiltersSchema, resolvePeriod } from "@/features/dashboard/schemas";
import { SERVICE_KIND_LABELS, SERVICE_KINDS } from "@/features/dashboard/types";
import { NO_PLACE_LABEL, SERVICE_PLACE_LABELS, serviceTypeLabel, type ServiceType } from "@/features/servicios/types";
import { requireRole } from "@/lib/auth/get-current-user";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";
import { formatDate, formatDateTime, toCents, toRateUnits, todayInTijuana } from "@/lib/utils/format";
import { openMonthsNote } from "@/lib/utils/month-lock";

/** Renglones de las hojas por unidad y por proveedor (el máximo que da reporte_gastos). */
const RANKING_LIMIT = 50;
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
/** Mantenimiento (correctivo y preventivo) o Reparación (servicio), como en Reportes. */
const kindGroup = (type: ServiceType | null) =>
  type === "correctivo" || type === "preventivo" ? "Mantenimiento" : type === "servicio" ? "Reparación" : "Sin tipo";
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

  const [report, rows, lock] = await Promise.all([
    getReport(period, filters, RANKING_LIMIT),
    listExportRows(period, filters),
    getMonthLock(),
  ]);
  const totalCents = toCents(report.total) ?? 0;

  const summary: SheetData = [
    [{ value: "Reporte de gastos de la flotilla", fontWeight: "bold" }],
    ["Periodo", `${period.label}: ${formatDate(period.from)} al ${formatDate(period.to)}`],
    ["Cierre de mes", openMonthsNote(period.from, period.to, lock)],
    ["Grupo", filters.grupo ? GROUP_LABELS[filters.grupo] : "Todos"],
    ["Tipo de unidad", filters.tipo ? (report.typeNames[filters.tipo] ?? filters.tipo) : "Todos"],
    ["Total invertido", money(report.total)],
    [`Periodo anterior (${formatDate(report.previousFrom)} al ${formatDate(report.previousTo)})`, money(report.previousTotal)],
    ["Servicios", report.services],
    ["Gastos", report.expenses],
    ["Unidades con gastos", report.units],
    ["Pagado en dólares", { ...money(report.usd.amount), format: USD }],
    ["Equivalente en pesos (incluido en el total)", money(report.usd.mxn)],
    ["Generado", formatDateTime(new Date().toISOString())],
    rows.length === 50000 ? ["Aviso", "El detalle se cortó en 50,000 renglones; usa un periodo más corto."] : [],
    report.byUnit.length === RANKING_LIMIT || report.bySupplier.length === RANKING_LIMIT || report.byWorkshop.length === RANKING_LIMIT
      ? ["Aviso", `Las hojas por unidad, por proveedor y por taller muestran los ${RANKING_LIMIT} con más gasto.`]
      : [],
  ];

  const expenses: SheetData = [
    header("Fecha", "Unidad", "Tipo", "Grupo", "Categoría", "Concepto", "Proveedor", "Descripción", "Monto", "Moneda", "Dólares", "Tipo de cambio", "Tipo de servicio", "Mantenimiento / Reparación", "Dónde se hizo", "Taller"),
    ...rows.map((row): Cell[] => [
      date(row.date),
      row.economicNumber,
      report.typeNames[row.type] ?? row.type,
      GROUP_LABELS[row.group] ?? "",
      row.category,
      row.concept ?? "",
      row.supplier,
      row.description ?? "",
      money(row.amount),
      row.currency,
      row.usdAmount ? { ...money(row.usdAmount), format: USD } : null,
      row.exchangeRate ? { value: (toRateUnits(row.exchangeRate) ?? 0) / 10000, type: Number, format: RATE } : null,
      serviceTypeLabel(row.serviceType),
      kindGroup(row.serviceType),
      row.place ? SERVICE_PLACE_LABELS[row.place] : NO_PLACE_LABEL,
      row.workshop ?? "",
    ]),
    [null, null, null, null, null, null, null, { value: "Total", fontWeight: "bold" }, { ...money(report.total), fontWeight: "bold" }],
  ];

  const byUnit: SheetData = [
    header("Unidad", "Tipo", "Grupo", "Servicios", "Total", "% del total"),
    ...report.byUnit.map((u): Cell[] => [
      u.economicNumber,
      report.typeNames[u.type] ?? u.type,
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
    header("Mes", "Servicios", "Total", ...SERVICE_KINDS.map((k) => SERVICE_KIND_LABELS[k])),
    ...report.byMonth.map((m): Cell[] => [
      monthLongLabel(m.month),
      m.services,
      money(m.total),
      ...SERVICE_KINDS.map((k) => money(m.kinds[k])),
    ]),
  ];

  const byServiceType: SheetData = [
    header("Mantenimiento / Reparación", "Tipo de servicio", "Servicios", "Total", "% del total"),
    ...report.byServiceType.map((t): Cell[] => [
      kindGroup(t.type),
      t.type ? serviceTypeLabel(t.type) : `${serviceTypeLabel(null)} (servicios de antes)`,
      t.services,
      money(t.total),
      share(t.total, totalCents),
    ]),
  ];

  const bySupplier: SheetData = [
    header("Proveedor de las piezas", "Servicios", "Total", "% del total"),
    ...report.bySupplier.map((p): Cell[] => [p.name, p.services, money(p.total), share(p.total, totalCents)]),
  ];

  // ¿Dónde se hizo? (5G): por lugar y los talleres de fuera que más se llevaron.
  const byPlace: SheetData = [
    header("Dónde se hizo", "Servicios", "Total", "% del total"),
    ...report.byPlace.map((p): Cell[] => [
      p.place ? SERVICE_PLACE_LABELS[p.place] : `${NO_PLACE_LABEL} (servicios de antes)`,
      p.services,
      money(p.total),
      share(p.total, totalCents),
    ]),
  ];

  const byWorkshop: SheetData = [
    header("Taller de fuera", "Servicios", "En camino", "Total", "% del total"),
    ...report.byWorkshop.map((t): Cell[] => [t.name, t.services, t.onTheRoad, money(t.total), share(t.total, totalCents)]),
  ];

  const buffer = await writeXlsxFile([
    { data: summary, sheet: "Resumen", columns: [{ width: 32 }, { width: 48 }] },
    {
      data: expenses,
      sheet: "Gastos",
      columns: [{ width: 12 }, { width: 10 }, { width: 14 }, { width: 12 }, { width: 34 }, { width: 30 }, { width: 26 }, { width: 40 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 24 }, { width: 18 }, { width: 30 }],
    },
    { data: byUnit, sheet: "Por unidad", columns: [{ width: 10 }, { width: 14 }, { width: 12 }, { width: 11 }, { width: 16 }, { width: 12 }] },
    { data: byCategory, sheet: "Por categoría", columns: [{ width: 40 }, { width: 10 }, { width: 16 }, { width: 12 }] },
    { data: byMonth, sheet: "Por mes", columns: [{ width: 22 }, { width: 11 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }] },
    { data: byServiceType, sheet: "Por tipo de servicio", columns: [{ width: 26 }, { width: 34 }, { width: 11 }, { width: 16 }, { width: 12 }] },
    { data: byPlace, sheet: "Dónde se hizo", columns: [{ width: 34 }, { width: 11 }, { width: 16 }, { width: 12 }] },
    { data: byWorkshop, sheet: "Por taller", columns: [{ width: 34 }, { width: 11 }, { width: 11 }, { width: 16 }, { width: 12 }] },
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
