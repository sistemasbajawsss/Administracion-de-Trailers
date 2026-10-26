"use client";

import dynamic from "next/dynamic";

import type { MonthPoint } from "./monthly-chart";

// Recharts solo se descarga en Reportes (ARQUITECTURA, regla 10).
const MonthlyChart = dynamic(() => import("./monthly-chart").then((m) => m.MonthlyChart), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-md bg-muted sm:h-72" aria-label="Cargando gráfica" />,
});

export function MonthlyChartLoader({ data }: { data: MonthPoint[] }) {
  return <MonthlyChart data={data} />;
}
