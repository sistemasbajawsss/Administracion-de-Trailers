import { formatMoney, toCents } from "@/lib/utils/format";

import { SERVICE_KIND_COLORS, SERVICE_KIND_LABELS, SERVICE_KINDS, serviceKindTotals, type Report, type ServiceKind } from "../types";

const percent = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Swatch({ kind }: { kind: ServiceKind }) {
  return (
    <span aria-hidden="true" className="size-3 shrink-0 rounded-[3px]" style={{ backgroundColor: SERVICE_KIND_COLORS[kind] }} />
  );
}

/**
 * Mantenimiento (correctivo + preventivo) contra Reparaciones (tipo Servicio)
 * en el periodo: una barra al 100 % y dos bloques con su total y su parte.
 * Los servicios de antes de la 5F, sin tipo, van en una línea aparte.
 */
export function MaintenanceSplit({ report }: { report: Report }) {
  const kinds = serviceKindTotals(report.byServiceType);
  const cents = (k: ServiceKind) => toCents(kinds[k].total) ?? 0;
  const grand = toCents(report.total) || 1;
  const maintenanceCents = cents("correctivo") + cents("preventivo");
  const share = (c: number) => percent.format(c / grand);
  const visible = SERVICE_KINDS.filter((k) => cents(k) > 0);

  return (
    <div className="grid gap-5">
      {/* Barra al 100 %: separación de 2 px entre partes. */}
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {visible.map((k) => (
          <div key={k} style={{ width: `${(cents(k) / grand) * 100}%`, backgroundColor: SERVICE_KIND_COLORS[k] }} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Mantenimiento</p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-heading text-3xl font-bold whitespace-nowrap tabular-nums">
              {formatMoney((maintenanceCents / 100).toFixed(2))}
            </span>
            <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">{share(maintenanceCents)} del total</span>
          </p>
          <ul className="mt-3 grid gap-2 text-sm">
            {(["correctivo", "preventivo"] as const).map((k) => (
              <li key={k} className="flex min-w-0 items-center gap-2">
                <Swatch kind={k} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{SERVICE_KIND_LABELS[k]}</span>
                  <span className="text-muted-foreground"> · {plural(kinds[k].services, "servicio", "servicios")}</span>
                </span>
                <span className="font-medium whitespace-nowrap tabular-nums">{formatMoney(kinds[k].total)}</span>
                <span className="w-12 shrink-0 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                  {share(cents(k))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Swatch kind="servicio" />
            Reparaciones (Servicio)
          </p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-heading text-3xl font-bold whitespace-nowrap tabular-nums">{formatMoney(kinds.servicio.total)}</span>
            <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">{share(cents("servicio"))} del total</span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {plural(kinds.servicio.services, "servicio", "servicios")}: lo que se descompuso o no entra en mantenimiento.
          </p>
        </div>
      </div>

      {cents("sin_tipo") > 0 && (
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Swatch kind="sin_tipo" />
          <span className="min-w-0 flex-1">
            Sin tipo: {plural(kinds.sin_tipo.services, "servicio", "servicios")} de antes de que existiera el tipo de servicio
          </span>
          <span className="whitespace-nowrap tabular-nums">{formatMoney(kinds.sin_tipo.total)}</span>
          <span className="w-12 shrink-0 text-right whitespace-nowrap tabular-nums">{share(cents("sin_tipo"))}</span>
        </p>
      )}
    </div>
  );
}

/** Leyenda de la gráfica por mes: solo los tipos que tienen gasto. */
export function ServiceKindLegend({ kinds }: { kinds: readonly ServiceKind[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <Swatch kind={k} />
          {SERVICE_KIND_LABELS[k]}
        </li>
      ))}
    </ul>
  );
}
