"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CurrentUser } from "@/lib/auth/types";
import { formatDateTime, formatElapsed, todayInTijuana } from "@/lib/utils/format";
import { describeMileage, mileageIssue } from "@/lib/utils/mileage";

import { acceptTicket, acknowledgeTicket, cancelTicket, rejectTicket } from "../actions";
import { acceptTicketSchema, rejectTicketSchema, type AcceptTicketInput, type RejectTicketInput } from "../schemas";
import {
  canAttendTickets,
  canCancelTicket,
  PRIORITY_LABELS,
  type PendingTicket,
  type Ticket,
  type TicketPriority,
} from "../types";

const OFFLINE = "No se pudo conectar. Revisa tu internet e inténtalo de nuevo.";

type Viewer = Pick<CurrentUser, "id" | "role">;

const PRIORITY_STYLES: Record<TicketPriority, { edge: string; chip: string }> = {
  urgente: { edge: "border-l-red-600", chip: "bg-red-700 text-white" },
  normal: { edge: "border-l-amber-500", chip: "bg-amber-100 text-amber-950" },
  baja: { edge: "border-l-slate-300", chip: "bg-slate-100 text-slate-800" },
};

/** "Ahora" que avanza cada minuto, empezando por el del servidor (sin diferencias al hidratar). */
export function useNow(serverNow: string) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function PriorityChip({ priority }: { priority: TicketPriority }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-sm font-semibold", PRIORITY_STYLES[priority].chip)}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

/** Qué pasó con el ticket, en una línea que se lee sola. */
function outcome(ticket: Ticket) {
  if (ticket.status === "aceptado" && ticket.attendedAt) {
    return `Lo aceptó ${ticket.attendedName ?? "un capturista"} en ${formatElapsed(ticket.createdAt, ticket.attendedAt)} y entró a taller el ${formatDateTime(ticket.attendedAt)}.`;
  }
  if (ticket.status === "rechazado") {
    return `Lo rechazó ${ticket.attendedName ?? "un capturista"} el ${formatDateTime(ticket.attendedAt!)}.`;
  }
  if (ticket.status === "cancelado") {
    return `Lo canceló ${ticket.cancelledName ?? "el sistema"} el ${formatDateTime(ticket.cancelledAt!)}${ticket.cancelReason ? `: ${ticket.cancelReason}.` : "."}`;
  }
  return null;
}

/**
 * Un ticket de taller (5H, D16): unidad, prioridad, falla, quién y cuándo. Los
 * pendientes llevan sus acciones según el rol (la BD vuelve a revisarlas):
 * capturista y admin, Aceptar y Rechazar; quien lo levantó o el admin, Cancelar.
 * Los rechazados propios sin ver llevan "Enterado".
 */
export function TicketItem({
  ticket,
  viewer,
  now,
  linkUnit,
}: {
  ticket: Ticket | PendingTicket;
  viewer: Viewer;
  now: string;
  /** Admin y gerente abren la ficha de la unidad. */
  linkUnit: boolean;
}) {
  const pending = ticket.status === "pendiente";
  const style = PRIORITY_STYLES[ticket.priority];
  const unseenRejection = ticket.status === "rechazado" && !ticket.acknowledgedAt && ticket.createdBy === viewer.id;
  const number = (
    <span className="font-heading text-3xl leading-none font-bold tracking-wide text-brand-ink tabular-nums">
      {ticket.economicNumber}
    </span>
  );

  return (
    <article
      className={cn(
        "min-w-0 rounded-xl border border-l-4 bg-white px-4 py-3 sm:px-5",
        pending ? style.edge : "border-l-border",
        unseenRejection && "border-red-500/40 border-l-red-600 bg-red-50",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {linkUnit ? (
          <Link href={`/unidades/${ticket.unitId}`} className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            {number}
          </Link>
        ) : (
          number
        )}
        <span className="text-sm text-muted-foreground">{ticket.unitTypeName}</span>
        <PriorityChip priority={ticket.priority} />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">Ticket {ticket.folio}</span>
      </div>

      <p className="mt-2 whitespace-pre-line text-base">{ticket.fault}</p>

      <p className="mt-1 text-sm text-muted-foreground">
        Lo levantó {ticket.creatorName ?? "alguien"} el {formatDateTime(ticket.createdAt)}
        {pending && <span className="font-medium text-foreground">, espera hace {formatElapsed(ticket.createdAt, now)}</span>}.
      </p>

      {!pending && <p className="mt-1 text-sm">{outcome(ticket)}</p>}
      {ticket.status === "rechazado" && ticket.rejectReason && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">Motivo:</span> <span className="whitespace-pre-line">{ticket.rejectReason}</span>
        </p>
      )}

      {pending && <PendingActions ticket={ticket} viewer={viewer} />}
      {unseenRejection && <AcknowledgeButton ticket={ticket} />}
    </article>
  );
}

function PendingActions({ ticket, viewer }: { ticket: Ticket | PendingTicket; viewer: Viewer }) {
  const [mode, setMode] = useState<"accept" | "reject" | "cancel" | null>(null);
  const close = () => setMode(null);
  const attend = canAttendTickets(viewer) && "hasOdometer" in ticket;
  const cancel = canCancelTicket(ticket, viewer);
  if (!attend && !cancel) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attend && (
        <>
          <Button size="touch" onClick={() => setMode("accept")}>
            <Check aria-hidden="true" />
            Aceptar
          </Button>
          <Button size="touch" variant="outline" onClick={() => setMode("reject")}>
            <X aria-hidden="true" />
            Rechazar
          </Button>
        </>
      )}
      {cancel && (
        <Button size="touch" variant="ghost" className="text-red-800 hover:text-red-900" onClick={() => setMode("cancel")}>
          Cancelar ticket
        </Button>
      )}

      {attend && (
        <>
          <Dialog open={mode === "accept"} onOpenChange={(open) => !open && close()}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
              {mode === "accept" && <AcceptForm ticket={ticket as PendingTicket} onDone={close} />}
            </DialogContent>
          </Dialog>
          <Dialog open={mode === "reject"} onOpenChange={(open) => !open && close()}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
              {mode === "reject" && <RejectForm ticket={ticket} onDone={close} />}
            </DialogContent>
          </Dialog>
        </>
      )}
      {cancel && <CancelDialog open={mode === "cancel"} ticket={ticket} onDone={close} />}
    </div>
  );
}

function AcceptForm({ ticket, onDone }: { ticket: PendingTicket; onDone: () => void }) {
  const router = useRouter();
  const form = useForm<AcceptTicketInput>({ resolver: zodResolver(acceptTicketSchema), defaultValues: { mileage: "" } });

  async function onSubmit(values: AcceptTicketInput) {
    if (ticket.hasOdometer) {
      const problem = mileageIssue(values.mileage, { required: true, last: ticket.lastMileage, date: todayInTijuana() });
      if (problem) return void form.setError("mileage", { message: problem });
    }
    try {
      const result = await acceptTicket(ticket.id, ticket.hasOdometer ? values : { mileage: "" });
      if (!result.ok) {
        // Si otro ya lo aceptó o lo rechazó, el ticket ya no está pendiente: cerrar y actualizar.
        if (result.error.startsWith("Este ticket ya")) {
          toast.error(result.error);
          onDone();
          router.refresh();
          return;
        }
        return void form.setError("mileage", { message: result.error });
      }
      toast.success(`${ticket.economicNumber} entró a taller`);
      onDone();
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl">Aceptar el ticket de {ticket.economicNumber}</DialogTitle>
        <DialogDescription>
          La unidad entra a taller hoy con la falla del ticket y desde hoy cuentan sus días en taller.
        </DialogDescription>
      </DialogHeader>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-line">{ticket.fault}</p>

      {ticket.hasOdometer ? (
        <FieldGroup>
          <Controller
            name="mileage"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="accept-mileage">Kilometraje</FieldLabel>
                <Input
                  {...field}
                  id="accept-mileage"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  placeholder="Ej. 250000"
                  aria-invalid={fieldState.invalid}
                  aria-required
                  className="h-11 bg-white text-base tabular-nums"
                />
                {ticket.lastMileage && <FieldDescription>Último registrado: {describeMileage(ticket.lastMileage)}</FieldDescription>}
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </FieldGroup>
      ) : (
        <p className="text-sm text-muted-foreground">{ticket.unitTypeName}: no lleva kilometraje.</p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" size="touch" onClick={onDone}>
          No aceptar todavía
        </Button>
        <Button type="submit" size="touch" disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Dando entrada…" : "Aceptar y dar entrada"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RejectForm({ ticket, onDone }: { ticket: Ticket; onDone: () => void }) {
  const router = useRouter();
  const form = useForm<RejectTicketInput>({ resolver: zodResolver(rejectTicketSchema), defaultValues: { reason: "" } });

  async function onSubmit(values: RejectTicketInput) {
    try {
      const result = await rejectTicket(ticket.id, values);
      if (!result.ok) {
        if (result.error.startsWith("Este ticket ya")) {
          toast.error(result.error);
          onDone();
          router.refresh();
          return;
        }
        return void form.setError("reason", { message: result.error });
      }
      toast.success(`Ticket de ${ticket.economicNumber} rechazado`);
      onDone();
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl">Rechazar el ticket de {ticket.economicNumber}</DialogTitle>
        <DialogDescription>
          {ticket.creatorName ?? "Quien lo levantó"} verá el motivo en su Inicio. La unidad no entra a taller.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Controller
          name="reason"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="reject-reason">¿Por qué lo rechazas?</FieldLabel>
              <Textarea
                {...field}
                id="reject-reason"
                rows={3}
                maxLength={1000}
                autoFocus
                placeholder="Ej. No hay refacción hasta el lunes; la unidad puede seguir trabajando"
                aria-invalid={fieldState.invalid}
                className="bg-white text-base"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" size="touch" onClick={onDone}>
          No rechazar
        </Button>
        <Button type="submit" size="touch" variant="destructive" disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Rechazando…" : "Rechazar ticket"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CancelDialog({ open, ticket, onDone }: { open: boolean; ticket: Ticket; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const result = await cancelTicket(ticket.id);
      if (!result.ok) {
        toast.error(result.error);
        onDone();
        router.refresh();
        return;
      }
      toast.success(`Ticket de ${ticket.economicNumber} cancelado`);
      onDone();
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onDone()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar el ticket de {ticket.economicNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quita de la lista de los capturistas y la unidad no entra a taller. Queda en el historial como cancelado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="min-h-11">
            No, dejarlo
          </AlertDialogCancel>
          <Button variant="destructive" className="min-h-11" disabled={busy} onClick={() => void confirm()}>
            {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {busy ? "Cancelando…" : "Cancelar ticket"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** "Enterado": quita el aviso de rechazo del Inicio de quien levantó el ticket. */
export function AcknowledgeButton({ ticket, className }: { ticket: Ticket; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function acknowledge() {
    setBusy(true);
    try {
      const result = await acknowledgeTicket(ticket.id);
      if (!result.ok) return void toast.error(result.error);
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="touch" variant="outline" className={cn("mt-3 bg-white", className)} disabled={busy} onClick={() => void acknowledge()}>
      {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
      Enterado
    </Button>
  );
}
