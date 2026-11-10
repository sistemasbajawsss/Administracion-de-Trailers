"use client";

import { BadgeDollarSign, LoaderCircle, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils/format";
import { useToday } from "@/components/shared/use-today";

import { sellUnit, undoUnitSale } from "../actions";
import { sellUnitSchema, undoSaleSchema } from "../schemas";
import type { UnitSale } from "../types";

/**
 * Aviso en la ficha de una unidad vendida: fecha, nota y quién la registró.
 * El admin puede deshacer la venta (con motivo); el gerente solo lo ve.
 */
export function SoldBanner({
  unitId,
  economicNumber,
  sale,
  canUndo,
}: {
  unitId: string;
  economicNumber: string;
  sale: UnitSale;
  canUndo: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    const parsed = undoSaleSchema.safeParse({ reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Escribe el motivo");
    startTransition(async () => {
      try {
        const result = await undoUnitSale(unitId, parsed.data);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Se deshizo la venta: ${economicNumber} quedó como Activo`);
        setOpen(false);
        setReason("");
        router.refresh();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <section
      aria-label="Unidad vendida"
      className="mb-8 flex flex-col gap-4 rounded-xl border-2 border-brand-ink/20 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-heading text-2xl font-semibold text-brand-ink">Vendida el {formatDate(sale.date)}</p>
        {sale.note && <p className="mt-1 whitespace-pre-line">{sale.note}</p>}
        <p className="mt-1 text-sm text-muted-foreground">
          Su historial y sus gastos se conservan y siguen contando en Reportes.
          {sale.soldBy ? ` Registró ${sale.soldBy}.` : ""}
        </p>
      </div>
      {canUndo && (
        <>
          <Button variant="outline" size="touch" onClick={() => setOpen(true)} className="shrink-0">
            <Undo2 aria-hidden="true" />
            Deshacer venta
          </Button>
          <AlertDialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) {
                setReason("");
                setError(null);
              }
            }}
          >
            <AlertDialogContent className="sm:max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-heading text-xl">¿Deshacer la venta de {economicNumber}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Regresa a Activo y vuelve a aparecer para los capturistas. Queda registrado quién la deshizo y por qué.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="undo-sale-reason">Motivo</FieldLabel>
                <Textarea
                  id="undo-sale-reason"
                  rows={2}
                  value={reason}
                  maxLength={1000}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setError(null);
                  }}
                  placeholder="Ej. Se marcó por error; la venta no se hizo"
                  aria-invalid={Boolean(error)}
                  className="text-base"
                />
                {error && <FieldError>{error}</FieldError>}
              </Field>
              <AlertDialogFooter>
                <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
                <Button size="touch" onClick={confirm} disabled={isPending}>
                  {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                  {isPending ? "Guardando…" : "Deshacer venta"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}

/**
 * Sección "Venta" de la ficha (solo admin, unidad no vendida): fecha y nota,
 * con confirmación. Si está en taller, avisa que su entrada se cerrará.
 */
export function SellUnitZone({
  unitId,
  economicNumber,
  inShop,
  today: serverToday,
}: {
  unitId: string;
  economicNumber: string;
  inShop: boolean;
  today: string;
}) {
  const today = useToday(serverToday);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setDate(today);
    setNote("");
    setError(null);
  }

  function confirm() {
    const parsed = sellUnitSchema.safeParse({ date, note });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Revisa la fecha");
    if (parsed.data.date > today) return setError("La fecha de venta no puede ser futura");
    startTransition(async () => {
      try {
        const result = await sellUnit(unitId, parsed.data);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`${economicNumber} quedó como Vendida`);
        setOpen(false);
        reset();
        router.refresh();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <section aria-labelledby="zona-venta" className="mt-16 rounded-xl border bg-white">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="max-w-prose">
          <h2 id="zona-venta" className="text-xl font-semibold">Venta</h2>
          <p className="mt-1 text-muted-foreground">
            Si {economicNumber} se vendió, márcala aquí. Deja de aparecer para los capturistas y ya no recibe servicios;
            su historial y sus gastos se conservan.
          </p>
        </div>
        <Button variant="outline" size="touch" onClick={() => setOpen(true)} className="shrink-0">
          <BadgeDollarSign aria-hidden="true" />
          Marcar como vendida
        </Button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">¿Marcar {economicNumber} como vendida?</AlertDialogTitle>
            <AlertDialogDescription>
              {inShop
                ? "Está en taller: su entrada se cerrará con la fecha de venta y saldrá de la lista de Taller. "
                : ""}
              Si fue un error, se puede deshacer desde su ficha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="sale-date">Fecha de venta</FieldLabel>
            <Input
              id="sale-date"
              type="date"
              value={date}
              max={today}
              onChange={(event) => {
                setDate(event.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              className="h-11 min-w-0 bg-white text-base"
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="sale-note">Nota (opcional)</FieldLabel>
            <Textarea
              id="sale-note"
              rows={2}
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ej. Se vendió a Transportes del Norte"
              className="text-base"
            />
            <FieldDescription>A quién se vendió o cualquier dato que sirva después.</FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
            <Button size="touch" onClick={confirm} disabled={isPending}>
              {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isPending ? "Guardando…" : "Marcar como vendida"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
