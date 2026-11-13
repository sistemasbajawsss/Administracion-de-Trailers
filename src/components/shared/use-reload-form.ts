"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/**
 * "Cargar lo que guardó" (5I, ediciones simultáneas): vuelve a pedir la página al
 * servidor y, cuando llegan los datos nuevos, cambia `key` para montar el
 * formulario otra vez con ellos (lo escrito se borra, y el diálogo lo avisa).
 *
 * Las actualizaciones solas de la página (jalar hacia abajo, volver después de
 * 30 s) no cambian `key`: lo que se está escribiendo no se pierde.
 *
 * Uso: `const { key, reload, reloading } = useReloadForm();` y `<FormBody key={key} />`.
 */
export function useReloadForm() {
  const router = useRouter();
  const [key, setKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const waiting = useRef(false);

  useEffect(() => {
    if (pending || !waiting.current) return;
    waiting.current = false;
    setKey((current) => current + 1);
  }, [pending]);

  const reload = useCallback(() => {
    waiting.current = true;
    startTransition(() => router.refresh());
  }, [router]);

  return { key, reload, reloading: pending };
}
