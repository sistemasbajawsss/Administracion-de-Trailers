import "server-only";

import type { CurrentUser } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";


import { byTicketUrgency, canAttendTickets, canCreateTickets, type AdminApproval, type PendingTicket, type Ticket } from "./types";

const TICKET_COLUMNS =
  "id, folio, unidad_id, falla, prioridad, estatus, created_at, created_by, creador_nombre, atendido_at, atendido_nombre, atendido_por_admin, motivo_aprobacion, entrada_id, motivo_rechazo, enterado_at, cancelado_at, cancelado_nombre, motivo_cancelacion, unidad:unidades!inner(numero_economico, tipo, tipo_info:tipos_unidad(nombre, lleva_kilometraje))";

type TicketRow = {
  id: string;
  folio: number;
  unidad_id: string;
  falla: string;
  prioridad: Ticket["priority"];
  estatus: Ticket["status"];
  created_at: string;
  created_by: string | null;
  creador_nombre: string | null;
  atendido_at: string | null;
  atendido_nombre: string | null;
  atendido_por_admin: boolean;
  motivo_aprobacion: string | null;
  entrada_id: string | null;
  motivo_rechazo: string | null;
  enterado_at: string | null;
  cancelado_at: string | null;
  cancelado_nombre: string | null;
  motivo_cancelacion: string | null;
  unidad: { numero_economico: string; tipo: string; tipo_info: { nombre: string; lleva_kilometraje: boolean } | null };
};

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    folio: row.folio,
    unitId: row.unidad_id,
    economicNumber: row.unidad.numero_economico,
    unitTypeName: row.unidad.tipo_info?.nombre ?? row.unidad.tipo,
    fault: row.falla,
    priority: row.prioridad,
    status: row.estatus,
    createdAt: row.created_at,
    createdBy: row.created_by,
    creatorName: row.creador_nombre,
    attendedAt: row.atendido_at,
    attendedName: row.atendido_nombre,
    attendedByAdmin: row.atendido_por_admin,
    approvalReason: row.motivo_aprobacion,
    entryId: row.entrada_id,
    rejectReason: row.motivo_rechazo,
    acknowledgedAt: row.enterado_at,
    cancelledAt: row.cancelado_at,
    cancelledName: row.cancelado_nombre,
    cancelReason: row.motivo_cancelacion,
  };
}

/** Tickets pendientes (todos los ven), urgentes primero y luego el más viejo. */
export async function listPendingTickets(): Promise<PendingTicket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tickets_taller").select(TICKET_COLUMNS).eq("estatus", "pendiente").returns<TicketRow[]>();
  if (error) throw new Error("No se pudieron cargar los tickets pendientes");
  return data.map(toTicket).sort(byTicketUrgency);
}

/** Últimos tickets aprobados por un administrador (sección propia en Tickets, los tres roles). */
export async function listAdminApprovals(limit = 10): Promise<Ticket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets_taller")
    .select(TICKET_COLUMNS)
    .eq("estatus", "aceptado")
    .eq("atendido_por_admin", true)
    .order("atendido_at", { ascending: false })
    .order("id")
    .limit(limit)
    .returns<TicketRow[]>();
  if (error) throw new Error("No se pudieron cargar los tickets aprobados");
  return data.map(toTicket);
}

/**
 * Las últimas N aprobaciones de admin, para el aviso de los capturistas: el
 * contador de avisos dice cuántas hubo; aquí, con sesión, quién y de qué unidad.
 */
export async function listLatestAdminApprovals(count: number): Promise<AdminApproval[]> {
  const tickets = await listAdminApprovals(Math.min(Math.max(count, 1), 10));
  return tickets.map((t) => ({ id: t.id, economicNumber: t.economicNumber, approverName: t.attendedName, reason: t.approvalReason }));
}

/** Rechazos que quien levantó el ticket todavía no ve ("Enterado"), el más nuevo primero. */
export async function listUnseenRejections(userId: string): Promise<Ticket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets_taller")
    .select(TICKET_COLUMNS)
    .eq("estatus", "rechazado")
    .eq("created_by", userId)
    .is("enterado_at", null)
    .order("atendido_at", { ascending: false })
    .order("id")
    .returns<TicketRow[]>();
  if (error) throw new Error("No se pudieron cargar los tickets rechazados");
  return data.map(toTicket);
}

export const TICKET_HISTORY_BATCH_SIZE = 20;

/** Tickets ya atendidos o cancelados, el más nuevo primero, por tandas. */
export async function listTicketHistory(offset = 0, limit = TICKET_HISTORY_BATCH_SIZE): Promise<{ tickets: Ticket[]; total: number }> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("tickets_taller")
    .select(TICKET_COLUMNS, { count: "exact" })
    .neq("estatus", "pendiente")
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + limit - 1)
    .returns<TicketRow[]>();
  if (error) throw new Error("No se pudo cargar el historial de tickets");
  return { tickets: data.map(toTicket), total: count ?? 0 };
}

/**
 * Número del menú: lo que este usuario tiene que atender. Capturista y admin,
 * los pendientes; admin y gerente, además, sus tickets rechazados sin "Enterado".
 */
export async function countTicketsNeedingAttention(user: CurrentUser): Promise<number> {
  const supabase = await createClient();
  const [pending, rejected] = await Promise.all([
    canAttendTickets(user)
      ? supabase.from("tickets_taller").select("id", { count: "exact", head: true }).eq("estatus", "pendiente")
      : Promise.resolve({ count: 0, error: null }),
    canCreateTickets(user)
      ? supabase
          .from("tickets_taller")
          .select("id", { count: "exact", head: true })
          .eq("estatus", "rechazado")
          .eq("created_by", user.id)
          .is("enterado_at", null)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  // El número es un aviso: si falla, no se muestra (la página Tickets sí avisa del error).
  if (pending.error || rejected.error) return 0;
  return (pending.count ?? 0) + (rejected.count ?? 0);
}

/** Unidades con ticket pendiente: no reciben otro ticket ni entrada directa a taller. */
export async function listUnitsWithPendingTicket(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tickets_taller").select("unidad_id").eq("estatus", "pendiente");
  if (error) throw new Error("No se pudieron revisar los tickets pendientes");
  return new Set(data.map((row) => row.unidad_id));
}
