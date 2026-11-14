/** Un mes en la sección "Cierre de mes" de Reportes (5I, D17). */
export type MonthCloseRow = {
  /** "aaaa-mm-01". */
  month: string;
  current: boolean;
  closed: boolean;
  /** Cuándo se cierra (o se cerró) solo, "aaaa-mm-dd". */
  closesOn: string;
  /** Último cierre o reapertura hecho a mano; null = nunca se tocó. */
  lastAction: "cerrar" | "reabrir" | null;
  by: string | null;
  at: string | null;
  reason: string | null;
};
