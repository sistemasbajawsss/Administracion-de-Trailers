import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/** Bucket privado de comprobantes (Sección 3). */
export const RECEIPTS_BUCKET = "comprobantes";

/**
 * Borra archivos de comprobantes que ya ningún comprobante usa (la política de
 * Storage no deja borrar los que siguen registrados). Si falla, el archivo queda
 * huérfano pero inaccesible: no se interrumpe la acción del usuario.
 */
export async function removeReceiptFiles(supabase: SupabaseClient<Database>, paths: string[] | null) {
  if (!paths?.length) return;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(RECEIPTS_BUCKET).remove(paths.slice(i, i + 100));
    if (error) console.error("No se pudieron borrar archivos de comprobantes", error.message);
  }
}
