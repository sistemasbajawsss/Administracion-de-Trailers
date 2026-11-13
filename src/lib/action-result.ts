import { z } from "zod";

/**
 * Respuesta común de las Server Actions. Nunca lanzar errores crudos a la UI.
 * `conflict` (5I): otra persona guardó el registro mientras se editaba; la
 * pantalla lo explica con EditConflictDialog en lugar de un toast.
 */
export type EditConflict = { by: string | null; at: string };

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; conflict?: EditConflict };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Versión de un registro: su `updated_at` tal como lo da la BD ("2026-11-13T22:52:48.638837+00:00"). */
export const versionSchema = z.string().max(40).regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/);

/** Detalle del error PT409 de la BD: `{"por": "Nombre", "a": "<timestamptz>"}`. */
export function parseConflict(details: string | null | undefined): EditConflict {
  try {
    const parsed = JSON.parse(details ?? "") as { por?: unknown; a?: unknown };
    return {
      by: typeof parsed.por === "string" ? parsed.por : null,
      at: typeof parsed.a === "string" ? parsed.a : new Date().toISOString(),
    };
  } catch {
    return { by: null, at: new Date().toISOString() };
  }
}

export function failConflict(error: string, conflict: EditConflict): { ok: false; error: string; conflict: EditConflict } {
  return { ok: false, error, conflict };
}
