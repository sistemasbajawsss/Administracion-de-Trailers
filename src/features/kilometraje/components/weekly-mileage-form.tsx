"use client";

import { CircleCheck, LoaderCircle, RefreshCw, Save, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { useToday } from "@/components/shared/use-today";
import { useUnsavedChanges } from "@/components/shared/use-unsaved-changes";
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
import { Input } from "@/components/ui/input";
import { UNIT_GROUP_LABELS, UNIT_GROUPS, unitGroupOf } from "@/features/unidades/types";
import type { Role } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { daysBetween, formatDate, formatDateTime, formatKm } from "@/lib/utils/format";
import {
  describeCaptureDays,
  describeMileage,
  isWeeklyCaptureDay,
  nextCaptureDate,
  parseKm,
  weekdayName,
  weekStart,
  weeklyJumpLimit,
} from "@/lib/utils/mileage";

import { saveWeeklyReadings } from "../actions";
import { readingPermission, type WeeklyMileageRow } from "../types";
import { ReadingActions } from "./reading-actions";

const OFFLINE = "No se pudo conectar. Revisa tu internet e inténtalo de nuevo.";

const compact = (text: string) => text.normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Problema de lo escrito en un renglón (igual que la BD: lo del mismo día no se compara). */
function rowIssue(row: WeeklyMileageRow, text: string, today: string): string | null {
  if (text.trim() === "") return null;
  const km = parseKm(text);
  if (km === null) return "Kilometraje: solo números";
  if (row.last && today > row.last.date && km < row.last.km) {
    return `${row.economicNumber} tiene menos kilometraje que la última vez: ${describeMileage(row.last)}. No se va a guardar.`;
  }
  return null;
}

/** Kilometraje recorrido si pasa del tope del aviso "¿Seguro?" (D15); si no, null. */
function bigJump(row: WeeklyMileageRow, text: string, today: string) {
  const km = parseKm(text);
  if (km === null || !row.last) return null;
  const days = Math.max(1, daysBetween(row.last.date, today));
  const weeks = Math.ceil(days / 7);
  const diff = km - row.last.km;
  return diff > weeklyJumpLimit(row.operation, weeks) ? { diff, days } : null;
}

const daysLabel = (days: number) => (days < 7 ? plural(days, "día", "días") : plural(Math.round(days / 7), "semana", "semanas"));

/**
 * Kilometraje semanal (5H, D15): las unidades activas con odómetro, con su
 * último kilometraje y un campo para el de la foto del tablero de esta semana.
 * Se guardan todas con un solo botón; cada una se guarda o se rechaza sola.
 * - Capturista: los días de registro que eligió el admin. Admin: cualquier día. Gerente: solo consulta.
 * - Menor que la última lectura: se marca en rojo y no se envía.
 * - Salto grande: pregunta "¿Seguro?" antes de guardar.
 */
export function WeeklyMileageForm({
  rows,
  week,
  days,
  user,
  today: serverToday,
  canOpenUnits,
}: {
  rows: WeeklyMileageRow[];
  /** Días de registro del capturista (1 = lunes … 7 = domingo). */
  days: number[];
  /** Lunes de la semana que muestra la lista. */
  week: string;
  user: { id: string; role: Role };
  today: string;
  canOpenUnits: boolean;
}) {
  const router = useRouter();
  const today = useToday(serverToday);
  const staleWeek = weekStart(today) !== week;
  const canCapture = !staleWeek && (user.role === "admin" || (user.role === "capturista" && isWeeklyCaptureDay(today, days)));

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const pendingCount = rows.filter((r) => !r.reading).length;
  const [view, setView] = useState<"pendientes" | "todas">(pendingCount > 0 ? "pendientes" : "todas");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<{ row: WeeklyMileageRow; diff: number; days: number }[] | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = Object.values(drafts).some((v) => v.trim() !== "");
  const { leaveDialog } = useUnsavedChanges(dirty, () => setDrafts({}));

  const editable = canCapture ? rows.filter((r) => !r.reading) : [];
  const filled = editable.filter((r) => (drafts[r.unitId] ?? "").trim() !== "");
  const invalid = filled.filter((r) => rowIssue(r, drafts[r.unitId]!, today) !== null);
  const ready = filled.filter((r) => rowIssue(r, drafts[r.unitId]!, today) === null);

  const registered = rows.length - pendingCount;
  const q = compact(query.trim());
  const shown = rows
    .filter((r) => view === "todas" || !r.reading)
    .filter((r) => !q || compact(r.economicNumber).includes(q));
  const sections = UNIT_GROUPS.map((g) => ({ group: g, rows: shown.filter((r) => unitGroupOf(r.operation) === g) })).filter(
    (s) => s.rows.length > 0,
  );

  function setDraft(unitId: string, value: string) {
    setDrafts((current) => ({ ...current, [unitId]: value }));
    setServerErrors((current) => {
      if (!(unitId in current)) return current;
      const next = { ...current };
      delete next[unitId];
      return next;
    });
  }

  /** Enter pasa al siguiente campo (con 30 unidades no hay que tocar cada uno). */
  function nextOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-weekly-km]"));
    const index = inputs.indexOf(event.currentTarget);
    const next = inputs[index + 1];
    if (next) next.focus();
    else event.currentTarget.blur();
  }

  function requestSave() {
    if (ready.length === 0) {
      toast.error(
        invalid.length > 0
          ? "Ninguna lectura se puede guardar: revisa las marcadas en rojo."
          : "Escribe el kilometraje de al menos una unidad.",
      );
      return;
    }
    const jumps = ready
      .map((row) => ({ row, jump: bigJump(row, drafts[row.unitId]!, today) }))
      .filter((x) => x.jump !== null)
      .map((x) => ({ row: x.row, ...x.jump! }));
    if (jumps.length > 0) setConfirming(jumps);
    else void save();
  }

  async function save() {
    setConfirming(null);
    setSaving(true);
    try {
      const result = await saveWeeklyReadings(ready.map((r) => ({ unitId: r.unitId, km: drafts[r.unitId]! })));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { saved, rejected } = result.data;
      setDrafts((current) => {
        const next = { ...current };
        for (const id of saved) delete next[id];
        return next;
      });
      setServerErrors((current) => {
        const next = { ...current };
        for (const r of rejected) if (r.unitId) next[r.unitId] = r.message;
        return next;
      });
      if (saved.length > 0) toast.success(`Se ${saved.length === 1 ? "guardó 1 lectura" : `guardaron ${saved.length} lecturas`}`);
      const notSent = invalid.length + rejected.length;
      if (notSent > 0) toast.error(`${plural(notSent, "lectura no se guardó", "lecturas no se guardaron")}: revisa las marcadas en rojo.`);
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Notice role={user.role} canCapture={canCapture} staleWeek={staleWeek} today={today} days={days} onRefresh={() => router.refresh()} />

      <div className="mb-6 min-w-0 rounded-xl border bg-white px-5 py-4">
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-medium">
            Registradas <span className="tabular-nums">{registered}</span> de <span className="tabular-nums">{rows.length}</span>
          </span>
          <span className={cn("text-sm", pendingCount > 0 ? "font-medium text-red-800" : "text-emerald-800")}>
            {pendingCount > 0 ? `Faltan ${plural(pendingCount, "unidad", "unidades")}` : "Todas tienen su lectura de esta semana"}
          </span>
        </p>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Unidades con lectura esta semana"
          aria-valuemin={0}
          aria-valuemax={rows.length}
          aria-valuenow={registered}
        >
          <div
            className="h-full rounded-full bg-emerald-600 transition-[width]"
            style={{ width: `${rows.length ? (registered / rows.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Buscar unidad, por ejemplo T-17"
            aria-label="Buscar unidad por número"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 bg-white pl-10 text-base"
          />
        </div>
        <div role="group" aria-label="Qué unidades mostrar" className="flex flex-wrap gap-2">
          {(
            [
              ["pendientes", "Sin lectura", pendingCount],
              ["todas", "Todas", rows.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors outline-none",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                view === key ? "border-brand-ink bg-brand-ink text-white" : "bg-white hover:border-brand-ink/40",
              )}
            >
              {label}
              <span className={cn("tabular-nums", view === key ? "text-white/80" : "text-muted-foreground")}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          requestSave();
        }}
      >
        {leaveDialog}
        {sections.length === 0 ? (
          <p className="rounded-xl border bg-white px-5 py-8 text-center text-muted-foreground">
            {q
              ? "Ninguna unidad coincide con la búsqueda."
              : view === "pendientes"
                ? "Todas las unidades tienen su lectura de esta semana."
                : "No hay unidades activas con odómetro."}
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {sections.map((section) => (
              <section key={section.group} aria-labelledby={`km-${section.group}`} className="min-w-0">
                <h2 id={`km-${section.group}`} className="mb-3 font-heading text-2xl font-semibold">
                  {UNIT_GROUP_LABELS[section.group]}
                </h2>
                <ul className="flex flex-col gap-2">
                  {section.rows.map((row) => (
                    <MileageRow
                      key={row.unitId}
                      row={row}
                      week={week}
                      today={today}
                      user={user}
                      canCapture={canCapture}
                      canOpenUnits={canOpenUnits}
                      value={drafts[row.unitId] ?? ""}
                      serverError={serverErrors[row.unitId] ?? null}
                      onChange={(value) => setDraft(row.unitId, value)}
                      onKeyDown={nextOnEnter}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {canCapture && editable.length > 0 && (
          // Pegada abajo: con muchas unidades el botón siempre está a la mano.
          <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {ready.length > 0 ? `${plural(ready.length, "lectura lista", "lecturas listas")} para guardar` : "Escribe el kilometraje de cada unidad"}
                {invalid.length > 0 && (
                  <span className="font-medium text-red-800"> · {plural(invalid.length, "con error", "con error")}</span>
                )}
              </p>
              <Button type="submit" size="touch" disabled={saving || ready.length === 0} className="w-full sm:w-auto">
                {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                {saving
                  ? "Guardando…"
                  : ready.length > 0
                    ? `Guardar ${plural(ready.length, "lectura", "lecturas")}`
                    : "Guardar lecturas"}
              </Button>
            </div>
          </div>
        )}
      </form>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">¿Seguro que recorrieron tanto?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming && confirming.length === 1 ? "Esta unidad sumó" : "Estas unidades sumaron"} más de lo normal desde
              su última lectura. Revisa la foto del tablero antes de guardar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="grid max-h-[40dvh] gap-2 overflow-y-auto">
            {confirming?.map(({ row, diff, days }) => (
              <li key={row.unitId} className="min-w-0 rounded-lg border bg-amber-50 px-3 py-2 text-sm">
                <span className="font-semibold">{row.economicNumber}</span> sumó{" "}
                <span className="font-semibold whitespace-nowrap">{formatKm(diff)}</span> en {daysLabel(days)}{" "}
                <span className="text-muted-foreground">
                  (de <span className="whitespace-nowrap">{formatKm(row.last!.km)}</span> a{" "}
                  <span className="whitespace-nowrap">{formatKm(parseKm(drafts[row.unitId] ?? "") ?? 0)}</span>)
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Revisar</AlertDialogCancel>
            <Button size="touch" onClick={() => void save()}>
              Sí, guardar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Aviso de arriba: quién puede capturar hoy y hasta cuándo. */
function Notice({
  role,
  canCapture,
  staleWeek,
  today,
  days,
  onRefresh,
}: {
  role: Role;
  canCapture: boolean;
  staleWeek: boolean;
  today: string;
  days: number[];
  onRefresh: () => void;
}) {
  if (staleWeek) {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-50 px-5 py-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
        <p>Ya empezó otra semana. Actualiza la pantalla para ver la lista nueva.</p>
        <Button variant="outline" size="touch" onClick={onRefresh} className="bg-white">
          <RefreshCw aria-hidden="true" />
          Actualizar
        </Button>
      </div>
    );
  }
  if (role === "gerente") return null;
  if (role === "capturista" && !canCapture) {
    const next = nextCaptureDate(today, days);
    return (
      <p className="mb-6 rounded-xl border bg-muted px-5 py-4">
        Hoy no se registra el kilometraje (se registra {describeCaptureDays(days)}). El siguiente día de registro es
        el {weekdayName(next)} {formatDate(next)}. Si hace falta registrar una, pídeselo a un administrador.
      </p>
    );
  }
  if (role === "admin" && !isWeeklyCaptureDay(today, days)) {
    return (
      <p className="mb-6 rounded-xl border bg-muted px-5 py-4">
        Los capturistas registran {describeCaptureDays(days)}; hoy solo un administrador puede registrar.
      </p>
    );
  }
  return null;
}

function MileageRow({
  row,
  week,
  today,
  user,
  canCapture,
  canOpenUnits,
  value,
  serverError,
  onChange,
  onKeyDown,
}: {
  row: WeeklyMileageRow;
  week: string;
  today: string;
  user: { id: string; role: Role };
  canCapture: boolean;
  canOpenUnits: boolean;
  value: string;
  serverError: string | null;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const inputId = `km-${row.unitId}`;
  const issue = serverError ?? rowIssue(row, value, today);
  const jump = !issue && value.trim() !== "" ? bigJump(row, value, today) : null;
  const permission = row.reading ? readingPermission(row.reading, user, today) : null;

  const number = canOpenUnits ? (
    <Link
      href={`/unidades/${row.unitId}`}
      className="rounded-sm font-heading text-2xl leading-none font-bold tracking-wide text-brand-ink tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {row.economicNumber}
    </Link>
  ) : (
    <span className="font-heading text-2xl leading-none font-bold tracking-wide text-brand-ink tabular-nums">
      {row.economicNumber}
    </span>
  );

  if (row.reading) {
    return (
      <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-l-4 border-l-emerald-600 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {number}
            <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-emerald-800 tabular-nums">
              <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
              {formatKm(row.reading.km)}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Registró {row.reading.author ?? "un usuario"}, {formatDateTime(row.reading.createdAt)}
          </p>
        </div>
        {permission && (
          <ReadingActions
            readingId={row.reading.id}
            km={row.reading.km}
            week={week}
            economicNumber={row.economicNumber}
            reasonRequired={permission.reasonRequired}
            isCurrentWeek
          />
        )}
      </li>
    );
  }

  return (
    <li
      className={cn(
        "grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-l-4 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-start sm:px-5",
        issue ? "border-l-red-600" : canCapture ? "border-l-border" : "border-l-amber-500",
      )}
    >
      <div className="min-w-0">
        {canCapture ? (
          <label htmlFor={inputId} className="block">
            {number}
          </label>
        ) : (
          number
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {row.last ? `Última: ${describeMileage(row.last)}` : "Aún no tiene kilometraje registrado"}
        </p>
        {!canCapture && <p className="mt-1 text-sm font-medium text-amber-800">Sin lectura esta semana</p>}
      </div>

      {canCapture && (
        <div className="min-w-0">
          <div className="relative">
            <Input
              id={inputId}
              data-weekly-km=""
              inputMode="numeric"
              enterKeyHint="next"
              autoComplete="off"
              placeholder="Kilometraje"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              aria-invalid={issue !== null}
              aria-describedby={issue || jump ? `${inputId}-nota` : undefined}
              aria-label={`Kilometraje de ${row.economicNumber}`}
              className="h-12 min-w-0 bg-white pr-11 text-lg tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">km</span>
          </div>
          {issue && (
            <p id={`${inputId}-nota`} className="mt-1.5 text-sm font-medium text-red-800">
              {issue}
            </p>
          )}
          {jump && (
            <p id={`${inputId}-nota`} className="mt-1.5 flex items-start gap-1.5 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Sumó {formatKm(jump.diff)} en {daysLabel(jump.days)}. Revisa la foto.
              </span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
