"use client";

import { ArrowDown, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Lo que hay que jalar (ya amortiguado) para que se actualice al soltar. */
const READY_AT = 64;
const MAX_PULL = 96;
/** Si la app estuvo en segundo plano más que esto, al volver se actualiza sola. */
const STALE_AFTER_MS = 30_000;

/** App instalada en la pantalla de inicio (iPhone o Android): ahí no hay "jalar para actualizar". */
function isInstalledApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** El dedo empezó dentro de algo que ya tiene scroll propio (lista de gastos, línea de cambios…). */
function insideScrolledBox(target: EventTarget | null) {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * Actualizar los datos de la pantalla:
 * - En la app instalada: jalar hacia abajo desde el tope y soltar (como en el navegador).
 * - En cualquier caso: al volver a la app después de un rato en otra.
 * Usa router.refresh(): vuelve a pedir los datos al servidor sin perder lo que
 * esté escrito en un formulario.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  // Mientras el dedo arrastra, el círculo sigue al dedo sin animación.
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const refresh = () => startTransition(() => router.refresh());

    // Al volver a la app después de un rato.
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (!isInstalledApp()) {
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }

    const setPullValue = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };
    const onStart = (event: TouchEvent) => {
      if (window.scrollY > 0 || event.touches.length !== 1) return;
      // Con un diálogo u hoja abierta, el gesto es de ellos.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (insideScrolledBox(event.target)) return;
      startY.current = event.touches[0]!.clientY;
      setDragging(true);
    };
    const onMove = (event: TouchEvent) => {
      if (startY.current === null) return;
      const distance = event.touches[0]!.clientY - startY.current;
      // Hacia arriba o si la página ya bajó: no es un "jalar para actualizar".
      if (distance <= 0 || window.scrollY > 0) {
        startY.current = null;
        setDragging(false);
        setPullValue(0);
        return;
      }
      setPullValue(Math.min(distance * 0.5, MAX_PULL));
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      setDragging(false);
      if (pullRef.current >= READY_AT) refresh();
      setPullValue(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const visible = pull > 8 || isPending;
  const ready = pull >= READY_AT;

  return (
    <div
      aria-hidden={!isPending}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center print:hidden"
      style={{
        transform: `translateY(calc(env(safe-area-inset-top) + ${isPending ? 16 : pull - 40}px))`,
        transition: dragging ? "none" : "transform 200ms ease-out",
        opacity: visible ? 1 : 0,
      }}
    >
      <span className="flex size-10 items-center justify-center rounded-full border bg-white text-brand-ink shadow-md">
        {isPending ? (
          <LoaderCircle className="size-5 animate-spin" aria-label="Actualizando" />
        ) : (
          <ArrowDown className={`size-5 transition-transform ${ready ? "rotate-180 text-brand-cyan" : ""}`} aria-hidden="true" />
        )}
      </span>
    </div>
  );
}
