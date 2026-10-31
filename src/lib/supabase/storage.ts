import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/** Bucket privado de comprobantes (Sección 3). */
export const RECEIPTS_BUCKET = "comprobantes";

/**
 * Borra archivos de comprobantes que ya ningún comprobante usa (la política de
 * Storage no deja borrar los que siguen registrados). Si falla, el archivo queda
 * huérfano pero inaccesible: no se interrumpe la acción del usuario.
 */
/** Un archivo subido que en este tiempo no se registró ya no se va a registrar. */
const ORPHAN_AGE_MS = 60 * 60 * 1000;

/**
 * Borra los archivos de la carpeta de un servicio que se subieron pero nunca se
 * registraron como comprobante (se cerró el navegador entre subir y registrar, o
 * se perdió la señal) y tienen más de una hora. Se llama al pedir una subida
 * nueva: así la carpeta no acumula archivos que nadie ve ni se cobran de más.
 */
export async function removeOrphanReceiptFiles(supabase: SupabaseClient<Database>, serviceId: string) {
  const [{ data: files }, { data: receipts }] = await Promise.all([
    supabase.storage.from(RECEIPTS_BUCKET).list(serviceId, { limit: 100 }),
    supabase.from("comprobantes").select("ruta_archivo").eq("servicio_id", serviceId),
  ]);
  if (!files?.length) return;
  const registered = new Set((receipts ?? []).map((r) => r.ruta_archivo));
  const cutoff = Date.now() - ORPHAN_AGE_MS;
  const orphans = files
    .filter((f) => f.id && f.created_at && new Date(f.created_at).getTime() < cutoff)
    .map((f) => `${serviceId}/${f.name}`)
    .filter((path) => !registered.has(path));
  await removeReceiptFiles(supabase, orphans);
}

export async function removeReceiptFiles(supabase: SupabaseClient<Database>, paths: string[] | null) {
  if (!paths?.length) return;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(RECEIPTS_BUCKET).remove(paths.slice(i, i + 100));
    if (error) console.error("No se pudieron borrar archivos de comprobantes", error.message);
  }
}
