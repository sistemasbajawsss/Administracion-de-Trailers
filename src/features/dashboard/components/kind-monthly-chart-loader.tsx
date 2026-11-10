"use client";

import dynamic from "next/dynamic";

import type { ServiceKind } from "../types";
import type { KindMonthPoint } from "./kind-monthly-chart";

// Recharts solo se descarga en Reportes (ARQUITECTURA, regla 10).
const KindMonthlyChart = dynamic(() => import("./kind-monthly-chart").then((m) => m.KindMonthlyChart), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-md bg-muted sm:h-72" aria-label="Cargando gráfica" />,
});

export function KindMonthlyChartLoader({ data, kinds }: { data: KindMonthPoint[]; kinds: readonly ServiceKind[] }) {
  return <KindMonthlyChart data={data} kinds={kinds} />;
}
