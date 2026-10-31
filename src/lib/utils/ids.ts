import { z } from "zod";

const uuid = z.uuid();

/** Ids que llegan sueltos a una Server Action: un valor mal formado no llega a la BD. */
export function isUuid(value: unknown): value is string {
  return uuid.safeParse(value).success;
}
