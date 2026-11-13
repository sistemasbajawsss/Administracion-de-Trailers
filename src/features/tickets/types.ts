import type { Database } from "@/lib/supabase/database.types";
import type { CurrentUser } from "@/lib/auth/types";

export type TicketPriority = Database["public"]["Enums"]["prioridad_ticket"];
export type TicketStatus = Database["public"]["Enums"]["estatus_ticket"];

export const TICKET_PRIORITIES = ["urgente", "normal", "baja"] as const satisfies readonly TicketPriority[];

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgente: "Urgente",
  normal: "Normal",
  baja: "Baja",
};

export const PRIORITY_HINTS: Record<TicketPriority, string> = {
  urgente: "No puede trabajar o es peligroso.",
  normal: "Hay que revisarla pronto.",
  baja: "Puede esperar.",
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  pendiente: "Pendiente",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

/** Un ticket de taller (5H, D16), con su unidad. */
export type Ticket = {
  id: string;
  folio: number;
  unitId: string;
  economicNumber: string;
  /** "Tractocamión", "Caja"… */
  unitTypeName: string;
  fault: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  createdBy: string | null;
  creatorName: string | null;
  attendedAt: string | null;
  attendedName: string | null;
  /** Lo aceptó (aprobó) o lo rechazó un administrador: se destaca con su nombre. */
  attendedByAdmin: boolean;
  /** Por qué lo aprobó el admin (obligatorio al aprobar). */
  approvalReason: string | null;
  entryId: string | null;
  rejectReason: string | null;
  acknowledgedAt: string | null;
  cancelledAt: string | null;
  cancelledName: string | null;
  cancelReason: string | null;
};

/** Ticket pendiente (aceptar ya no pide kilometraje: lo alimenta la captura semanal). */
export type PendingTicket = Ticket;

/** Ticket ligado a una estancia en taller (ficha de la unidad). */
export type StayTicket = {
  folio: number;
  priority: TicketPriority;
  creatorName: string | null;
  createdAt: string;
  attendedAt: string | null;
  attendedName: string | null;
  attendedByAdmin: boolean;
  approvalReason: string | null;
};

/** Aprobación de un admin para el aviso de los capturistas. */
export type AdminApproval = { id: string; economicNumber: string; approverName: string | null; reason: string | null };

/** Pendientes primero los urgentes; dentro de cada prioridad, el más viejo primero. */
const PRIORITY_ORDER: Record<TicketPriority, number> = { urgente: 0, normal: 1, baja: 2 };
export function byTicketUrgency(a: Ticket, b: Ticket) {
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Quién puede qué (la BD lo vuelve a revisar). */
export const canCreateTickets = (user: Pick<CurrentUser, "role">) => user.role === "admin" || user.role === "gerente";
export const canAttendTickets = (user: Pick<CurrentUser, "role">) => user.role === "admin" || user.role === "capturista";
export const canCancelTicket = (ticket: Pick<Ticket, "status" | "createdBy">, user: Pick<CurrentUser, "id" | "role">) =>
  ticket.status === "pendiente" && (user.role === "admin" || (user.role === "gerente" && ticket.createdBy === user.id));
