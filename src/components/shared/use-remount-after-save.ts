"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Next conserva ocultas las últimas pantallas visitadas con su estado (Activity).
 * Sin esto, volver a un formulario después de guardarlo lo mostraba todavía lleno
 * y se podía guardar duplicado. Los efectos vuelven a correr cada vez que la
 * pantalla se muestra: si se guardó, cambia `key` y el formulario se monta de
 * nuevo. Si se salió sin guardar, lo capturado se conserva.
 *
 * Uso: `<FormBody key={key} onSaved={markSaved} />`.
 */
export function useRemountAfterSave() {
  const [key, setKey] = useState(0);
  const saved = useRef(false);
  useEffect(() => {
    if (!saved.current) return;
    saved.current = false;
    setKey((current) => current + 1);
  }, []);
  const markSaved = useCallback(() => {
    saved.current = true;
  }, []);
  return { key, markSaved };
}
