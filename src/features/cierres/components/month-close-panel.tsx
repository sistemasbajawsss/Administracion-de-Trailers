"use client";

import { LoaderCircle, Lock, LockOpen } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { monthName } from "@/lib/utils/month-lock";

import { changeCloseDay, closeMonth, reopenMonth } from "../actions";
import { reopenMonthSchema } from "../schemas";
import type { MonthCloseRow } from "../types";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** Qué pasó con el mes, en una línea. */
function describe(row: MonthCloseRow) {
  if (row.current) return `En curso. Se cierra solo el ${formatDate(row.closesOn)}.`;
  if (row.closed) {
    return row.lastAction === "cerrar" && row.at
      ? `Lo cerró ${row.by ?? "un administrador"} el ${formatDateTime(row.at)}.`
      : `Se cerró solo el ${formatDate(row.closesOn)}.`;
  }
  return row.lastAction === "reabrir" && row.at
    ? `Lo reabrió ${row.by ?? "un administrador"} el ${formatDateTime(row.at)}. Sigue abierto hasta que lo cierres.`
    : `Se cierra solo el ${formatDate(row.closesOn)}.`;
}

/**
 * Cierre de mes (5I, D17), en Reportes. El admin cierra antes del día de cierre,
 * reabre con motivo y cambia el día; el gerente solo ve el estado.
 */
export function MonthClosePanel({
  months,
  closeDay,
  canManage,
}: {
  months: MonthCloseRow[];
  closeDay: number;
  canManage: boolean;
}) {
  const [closing, setClosing] = useState<MonthCloseRow | null>(null);
  const [reopening, setReopening] = useState<MonthCloseRow | null>(null);
  const [day, setDay] = useState(String(closeDay));
  const [savingDay, startSavingDay] = useTransition();

  function saveDay() {
    startSavingDay(async () => {
      try {
        const result = await changeCloseDay(Number(day));
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Listo: los meses se cierran solos el día ${day} del mes siguiente`);
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <section aria-labelledby="cierre-de-mes" className="min-w-0 rounded-xl border bg-white p-4 sm:p-5 print:hidden">
      <h2 id="cierre-de-mes" className="font-heading text-xl font-semibold">
        Cierre de mes
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Con el mes cerrado, el capturista ya no registra ni cambia servicios de ese mes (sí puede agregar facturas).
        {canManage ? " Tú sí, con motivo." : " El administrador sí, con motivo."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted/50 p-3 text-sm">
        {canManage ? (
          <>
            <label htmlFor="dia-cierre">Los meses se cierran solos el día</label>
            <Select items={Object.fromEntries(DAYS.map((d) => [String(d), String(d)]))} value={day} onValueChange={(v) => v && setDay(v)}>
              <SelectTrigger id="dia-cierre" className="h-11 w-20 bg-white text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)} className="min-h-11">
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>del mes siguiente.</span>
            {day !== String(closeDay) && (
              <Button size="touch" onClick={saveDay} disabled={savingDay}>
                {savingDay && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Guardar día
              </Button>
            )}
          </>
        ) : (
          <span>Los meses se cierran solos el día {closeDay} del mes siguiente.</span>
        )}
      </div>

      <ul className="mt-4 divide-y rounded-lg border">
        {months.map((row) => (
          <li key={row.month} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-base font-medium">
                {capitalize(monthName(row.month))}
                {row.current ? (
                  <Badge variant="outline">En curso</Badge>
                ) : row.closed ? (
                  <Badge variant="secondary">
                    <Lock aria-hidden="true" />
                    Cerrado
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-950">
                    <LockOpen aria-hidden="true" />
                    Abierto
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">{describe(row)}</p>
              {!row.closed && row.lastAction === "reabrir" && row.reason && (
                <p className="text-sm text-muted-foreground">Motivo: {row.reason}</p>
              )}
            </div>
            {canManage && !row.current && (
              row.closed ? (
                <Button variant="outline" size="touch" onClick={() => setReopening(row)}>
                  <LockOpen aria-hidden="true" />
                  Reabrir
                </Button>
              ) : (
                <Button variant="outline" size="touch" onClick={() => setClosing(row)}>
                  <Lock aria-hidden="true" />
                  Cerrar
                </Button>
              )
            )}
          </li>
        ))}
      </ul>

      <CloseMonthDialog row={closing} onClose={() => setClosing(null)} />
      <ReopenMonthDialog key={reopening?.month ?? "cerrado"} row={reopening} onClose={() => setReopening(null)} />
    </section>
  );
}

function CloseMonthDialog({ row, onClose }: { row: MonthCloseRow | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const name = row ? monthName(row.month) : "";

  function confirm() {
    if (!row) return;
    startTransition(async () => {
      try {
        const result = await closeMonth(row.month);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`${capitalize(name)} quedó cerrado`);
        onClose();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <AlertDialog open={row !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl">¿Cerrar {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            El capturista ya no podrá registrar, editar ni mover servicios de {name}, ni quitar sus facturas (sí
            agregarlas). Tú sí, con motivo. Puedes reabrirlo después.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="touch" disabled={pending}>
            Cancelar
          </AlertDialogCancel>
          <Button size="touch" onClick={confirm} disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {pending ? "Cerrando…" : "Cerrar el mes"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReopenMonthDialog({ row, onClose }: { row: MonthCloseRow | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = row ? monthName(row.month) : "";

  function confirm() {
    if (!row) return;
    const parsed = reopenMonthSchema.safeParse({ reason });
    if (!parsed.success) return void setError(parsed.error.issues[0]?.message ?? "Escribe el motivo");
    setError(null);
    startTransition(async () => {
      try {
        const result = await reopenMonth(row.month, parsed.data);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`${capitalize(name)} quedó abierto`);
        onClose();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <AlertDialog open={row !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl">¿Reabrir {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            El capturista podrá volver a registrar y cambiar servicios de {name}, y su reporte puede cambiar. Se queda
            abierto hasta que lo cierres otra vez.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor="reabrir-motivo">Motivo</FieldLabel>
          <Textarea
            id="reabrir-motivo"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej. Faltó un ticket de la T-17"
            aria-invalid={error !== null}
            className="bg-white text-base"
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel size="touch" disabled={pending}>
            Cancelar
          </AlertDialogCancel>
          <Button size="touch" onClick={confirm} disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {pending ? "Reabriendo…" : "Reabrir el mes"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
