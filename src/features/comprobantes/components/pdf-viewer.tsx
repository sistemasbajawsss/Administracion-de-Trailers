"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Más de esto no aporta en un ticket y gasta memoria del celular. */
const MAX_PIXEL_RATIO = 2;
const MAX_PAGES = 20;

/**
 * PDF dibujado con pdf.js dentro del modal: funciona igual en Android, iPhone y
 * computadora (los navegadores de Android no muestran PDF incrustados).
 * pdf.js se descarga solo la primera vez que alguien abre un PDF.
 */
export function PdfViewer({ url, title }: { url: string; title: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    const container = pagesRef.current;
    if (!container) return;
    container.replaceChildren();

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

        // Se baja con fetch (pasa por /comprobantes/[id] → URL firmada) y se le da a pdf.js.
        const response = await fetch(url);
        if (!response.ok) throw new Error("download");
        const data = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;

        const task = pdfjs.getDocument({ data });
        destroy = () => void task.destroy();
        const pdf = await task.promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);

        const width = container.clientWidth || 600;
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

        for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES); number++) {
          const page = await pdf.getPage(number);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${title}, página ${number} de ${pdf.numPages}`);
          canvas.className = "block rounded-sm bg-white shadow-sm";
          container.append(canvas);
          await page.render({ canvas, viewport }).promise;
          if (number === 1 && !cancelled) setState("ready");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url, title]);

  return (
    <div className="relative min-h-48">
      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
          Abriendo PDF…
        </div>
      )}
      {state === "error" && (
        <p className="rounded-md bg-muted p-6 text-center text-muted-foreground">
          No se pudo mostrar el PDF aquí. Usa “Descargar” para abrirlo en tu dispositivo.
        </p>
      )}
      <div ref={pagesRef} className="space-y-3" />
      {pageCount > MAX_PAGES && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Se muestran las primeras {MAX_PAGES} de {pageCount} páginas. Descárgalo para ver el resto.
        </p>
      )}
    </div>
  );
}
