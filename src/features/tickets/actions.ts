"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES, ROLES, VIEW_ALL_ROLES } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { todayInTijuana } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/ids";
import { mileageIssue, parseKm } from "@/lib/utils/mileage";

import { getTicketMileageRule, listTicketHistory } from "./queries";
import { acceptTicketSchema, createTicketSchema, rejectTicketSchema } from "./schemas";
import type { Ticket } from "./types";

/** Los mensajes de las funciones de tickets ya vienen en español y dicen qué pasó. */
function rpcErrorMessage(error: { code?: string; message?: string }, fallback: string) {
  if (["42501", "23505", "23514", "P0002"].includes(error.code ?? "") && error.message) {
    return error.message.includes("permission denied") ? "No tienes permiso para hacer esto." : error.message;
  }
  return fallback;
}

/** Tickets mueve el menú (en el layout), Inicio, Taller y las fichas. */
function revalidateTickets({ shop = false } = {}) {
  revalidatePath("/", "layout");
  if (shop) {
    revalidatePath("/taller");
    revalidatePath("/mantenimientos");
    revalidatePath("/kilometraje");
  }
}

/** Levantar un ticket (admin y gerente; es el único permiso de escritura del gerente). */
export async function createTicket(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos del ticket.");

  await requireRole(VIEW_ALL_ROLES);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crear_ticket_taller", {
    p_unidad_id: parsed.data.unitId,
    p_falla: parsed.data.fault,
    p_prioridad: parsed.data.priority,
  });
  if (error) return fail(rpcErrorMessage(error, "No se pudo levantar el ticket. Inténtalo de nuevo."));

  revalidateTickets();
  return ok({ id: data });
}

/** Aceptar (capturista y admin): da la entrada a taller con el kilometraje. */
export async function acceptTicket(id: unknown, input: unknown): Promise<ActionResult<{ entryId: string }>> {
  if (!isUuid(id)) return fail("Ticket no válido.");
  const parsed = acceptTicketSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa el kilometraje.");

  await requireRole(CAPTURE_ROLES);

  let rule: Awaited<ReturnType<typeof getTicketMileageRule>>;
  try {
    rule = await getTicketMileageRule(id);
  } catch {
    return fail("No se pudo aceptar el ticket. Inténtalo de nuevo.");
  }
  if (!rule) return fail("El ticket ya no existe.");
  if (rule.hasOdometer) {
    const problem = mileageIssue(parsed.data.mileage, { required: true, last: rule.last, date: todayInTijuana() });
    if (problem) return fail(problem);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aceptar_ticket_taller", {
    p_ticket_id: id,
    p_kilometraje: rule.hasOdometer ? (parseKm(parsed.data.mileage) ?? undefined) : undefined,
  });
  if (error) return fail(rpcErrorMessage(error, "No se pudo aceptar el ticket. Inténtalo de nuevo."));

  revalidateTickets({ shop: true });
  return ok({ entryId: data });
}

/** Rechazar (capturista y admin), con motivo. */
export async function rejectTicket(id: unknown, input: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Ticket no válido.");
  const parsed = rejectTicketSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Escribe el motivo.");

  await requireRole(CAPTURE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.rpc("rechazar_ticket_taller", { p_ticket_id: id, p_motivo: parsed.data.reason });
  if (error) return fail(rpcErrorMessage(error, "No se pudo rechazar el ticket. Inténtalo de nuevo."));

  revalidateTickets();
  return ok();
}

/** Cancelar (quien lo levantó o el admin), mientras siga pendiente. */
export async function cancelTicket(id: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Ticket no válido.");

  await requireRole(VIEW_ALL_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_ticket_taller", { p_ticket_id: id });
  if (error) return fail(rpcErrorMessage(error, "No se pudo cancelar el ticket. Inténtalo de nuevo."));

  revalidateTickets();
  return ok();
}

/** "Enterado": quien levantó el ticket ya vio el rechazo. */
export async function acknowledgeTicket(id: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return fail("Ticket no válido.");

  await requireRole(VIEW_ALL_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_ticket_enterado", { p_ticket_id: id });
  if (error) return fail(rpcErrorMessage(error, "No se pudo marcar como visto. Inténtalo de nuevo."));

  revalidateTickets();
  return ok();
}

/** Siguiente tanda del historial de la página Tickets. */
export async function loadMoreTicketHistory(offset: unknown): Promise<ActionResult<Ticket[]>> {
  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 100_000) {
    return fail("No se pudieron cargar más tickets.");
  }

  await requireRole(ROLES);

  try {
    return ok((await listTicketHistory(offset)).tickets);
  } catch {
    return fail("No se pudieron cargar más tickets. Inténtalo de nuevo.");
  }
}
