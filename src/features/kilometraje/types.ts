import type { UnitOperation } from "@/features/unidades/types";
import type { Role } from "@/lib/auth/types";
import { dateInTijuana } from "@/lib/utils/format";
import type { LastMileage } from "@/lib/utils/mileage";

/** Lectura semanal ya registrada (5H, D15). */
export type WeeklyReading = {
  id: string;
  km: number;
  author: string | null;
  createdBy: string | null;
  /** timestamptz */
  createdAt: string;
};

/** Un renglón de la página Kilometraje: unidad activa con odómetro y su lectura de esta semana. */
export type WeeklyMileageRow = {
  unitId: string;
  economicNumber: string;
  operation: UnitOperation | null;
  /** Kilometraje actual (incluye la lectura de esta semana si ya la tiene). */
  last: LastMileage | null;
  reading: WeeklyReading | null;
};

/** Un cambio a una lectura: corregida (de cuánto a cuánto) o quitada. */
export type ReadingChange = {
  id: string;
  readingId: string;
  action: "corregida" | "quitada";
  /** Lunes de la semana de la lectura. */
  week: string;
  previousKm: number;
  newKm: number | null;
  reason: string | null;
  author: string | null;
  createdAt: string;
};

/** Lectura semanal en la ficha de la unidad, con sus correcciones. */
export type UnitReading = WeeklyReading & {
  /** Lunes de la semana. */
  week: string;
  /** Día en que se registró. */
  date: string;
  changes: ReadingChange[];
};

/** Resultado de guardar la lista: qué unidades se guardaron y por qué no las demás. */
export type SaveReadingsResult = {
  saved: string[];
  rejected: { unitId: string | null; message: string }[];
};

/**
 * Quién puede corregir o quitar una lectura (D15): quien la capturó, el mismo
 * día y sin motivo; el admin, siempre, con motivo (sin él si es suya del día).
 * null = no puede. La BD vuelve a revisar lo mismo.
 */
export function readingPermission(
  reading: Pick<WeeklyReading, "createdBy" | "createdAt">,
  user: { id: string; role: Role },
  today: string,
): { reasonRequired: boolean } | null {
  const ownToday = reading.createdBy === user.id && dateInTijuana(reading.createdAt) === today;
  if (ownToday && user.role !== "gerente") return { reasonRequired: false };
  if (user.role === "admin") return { reasonRequired: true };
  return null;
}
