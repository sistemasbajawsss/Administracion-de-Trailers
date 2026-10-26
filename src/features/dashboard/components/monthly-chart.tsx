"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatMoney } from "@/lib/utils/format";

import { monthLabel, monthLongLabel } from "../schemas";

export type MonthPoint = {
  /** "2026-03" */
  month: string;
  /** Pesos como número, solo para dibujar; el texto exacto va en `total`. */
  value: number;
  total: string;
  services: number;
};

/** Eje en pesos, compacto y redondo: $0, $250 mil, $1.2 M. */
function compactMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000).toLocaleString("es-MX")} mil`;
  return `$${value}`;
}

function MonthTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = active ? (payload?.[0]?.payload as MonthPoint | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm">
      <p className="font-medium capitalize">{monthLongLabel(point.month)}</p>
      <p className="tabular-nums">{formatMoney(point.total)}</p>
      <p className="text-muted-foreground">
        {point.services} {point.services === 1 ? "servicio" : "servicios"}
      </p>
    </div>
  );
}

/**
 * Gasto por mes: una sola serie (cian de la marca), columnas de hasta 24 px con
 * extremo redondeado, cuadrícula horizontal de 1 px y tooltip al pasar.
 */
export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  return (
    <div className="h-64 w-full sm:h-72">
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
          <Tooltip content={MonthTooltip} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
          <Bar dataKey="value" fill="var(--brand-cyan)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
