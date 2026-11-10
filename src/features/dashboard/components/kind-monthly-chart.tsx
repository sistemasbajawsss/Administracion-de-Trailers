"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatMoney } from "@/lib/utils/format";

import { monthLabel, monthLongLabel } from "../schemas";
import { SERVICE_KIND_COLORS, SERVICE_KIND_LABELS, type ServiceKind } from "../types";

export type KindMonthPoint = {
  /** "2026-03" */
  month: string;
  total: string;
  /** Pesos como número, solo para dibujar; el texto exacto va en `amounts`. */
  correctivo: number;
  preventivo: number;
  servicio: number;
  sin_tipo: number;
  amounts: Record<ServiceKind, string>;
};

function compactMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000).toLocaleString("es-MX")} mil`;
  return `$${value}`;
}

function makeTooltip(kinds: readonly ServiceKind[]) {
  return function KindTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
    const point = active ? (payload?.[0]?.payload as KindMonthPoint | undefined) : undefined;
    if (!point) return null;
    return (
      <div className="min-w-48 rounded-md border bg-white px-3 py-2 text-sm shadow-sm">
        <p className="mb-1 font-medium capitalize">{monthLongLabel(point.month)}</p>
        <ul className="grid gap-0.5">
          {[...kinds].reverse().map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ backgroundColor: SERVICE_KIND_COLORS[k] }} />
              <span className="flex-1 text-muted-foreground">{SERVICE_KIND_LABELS[k]}</span>
              <span className="tabular-nums">{formatMoney(point.amounts[k])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 flex justify-between gap-4 border-t pt-1 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(point.total)}</span>
        </p>
      </div>
    );
  };
}

/**
 * Gasto por mes partido por tipo: columnas apiladas (correctivo abajo, luego
 * preventivo, reparaciones y sin tipo), 2 px de separación entre partes, un solo
 * eje en pesos y tooltip con lo de cada tipo.
 */
export function KindMonthlyChart({ data, kinds }: { data: KindMonthPoint[]; kinds: readonly ServiceKind[] }) {
  return (
    <div className="h-64 w-full min-w-0 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tickFormatter={compactMoney}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            width={64}
          />
          <Tooltip content={makeTooltip(kinds)} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
          {kinds.map((k) => (
            <Bar
              key={k}
              dataKey={k}
              name={SERVICE_KIND_LABELS[k]}
              stackId="tipo"
              fill={SERVICE_KIND_COLORS[k]}
              stroke="#ffffff"
              strokeWidth={1}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
