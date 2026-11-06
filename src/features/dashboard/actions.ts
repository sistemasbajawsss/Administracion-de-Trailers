"use server";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { VIEW_ALL_ROLES } from "@/lib/auth/types";
import { todayInTijuana } from "@/lib/utils/format";

import { getReport } from "./queries";
import { reportFiltersSchema, resolvePeriod, type ReportFilters, type ResolvedPeriod } from "./schemas";
import type { Report } from "./types";

export type ReportPdfData = { report: Report; period: ResolvedPeriod; filters: ReportFilters };

/**
 * Datos de Reportes para armar el PDF en el navegador (iPhone con la app en la
 * pantalla de inicio, donde no hay cuadro de impresión). Es una lectura: llama a
 * queries.ts con la sesión del usuario (RLS aplica), ver docs/ARQUITECTURA.md.
 */
export async function getReportPdfData(input: unknown): Promise<ActionResult<ReportPdfData>> {
  const parsed = reportFiltersSchema.safeParse(input);
  if (!parsed.success) return fail("No se pudo preparar el PDF.");

  await requireRole(VIEW_ALL_ROLES);
  const period = resolvePeriod(parsed.data, todayInTijuana());

  try {
    return ok({ report: await getReport(period, parsed.data), period, filters: parsed.data });
  } catch {
    return fail("No se pudo preparar el PDF. Inténtalo de nuevo.");
  }
}
