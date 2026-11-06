"use client";

import { LoaderCircle, Printer, Share } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { getReportPdfData } from "../actions";

/** iPhone / iPad con la app abierta desde la pantalla de inicio: ahí iOS no tiene cuadro de impresión. */
const isIosHomeScreenApp = () =>
  typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Menú de compartir de iOS (Guardar en Archivos, Imprimir, WhatsApp…); si no hay, se descarga. */
async function shareOrDownload(file: File) {
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: file.name });
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * En el navegador abre el cuadro de impresión: ahí se elige la impresora o
 * "Guardar como PDF". La hoja sale sin menú ni filtros (estilos print: y @media print).
 * En la app instalada en iPhone (sin cuadro de impresión) arma el PDF en el
 * celular con los mismos filtros y abre el menú de compartir.
 */
export function PrintButton() {
  const searchParams = useSearchParams();
  const filtersKey = searchParams.toString();
  const [busy, setBusy] = useState(false);
  // PDF ya armado para estos filtros: si iOS no dejó abrir el menú de compartir
  // (pasó mucho tiempo desde el toque), un segundo toque lo abre al instante.
  const [ready, setReady] = useState<{ key: string; file: File } | null>(null);
  const readyFile = ready?.key === filtersKey ? ready.file : null;

  async function share(file: File) {
    try {
      await shareOrDownload(file);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return; // Cerró el menú.
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        toast.success("PDF listo. Toca «Compartir PDF» para guardarlo o imprimirlo.");
        return;
      }
      toast.error("No se pudo abrir el menú para compartir. Inténtalo de nuevo.");
    }
  }

  async function handleClick() {
    if (!isIosHomeScreenApp()) {
      window.print();
      return;
    }
    if (readyFile) {
      await share(readyFile);
      return;
    }

    setBusy(true);
    try {
      const result = await getReportPdfData(Object.fromEntries(new URLSearchParams(filtersKey)));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { buildReportPdf } = await import("./report-pdf");
      const blob = await buildReportPdf(result.data);
      const { from, to } = result.data.period;
      const file = new File([blob], `reporte-gastos-${from}-al-${to}.pdf`, { type: "application/pdf" });
      setReady({ key: filtersKey, file });
      await share(file);
    } catch {
      toast.error("No se pudo preparar el PDF. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="touch" onClick={handleClick} disabled={busy}>
      {busy ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : readyFile ? (
        <Share aria-hidden="true" />
      ) : (
        <Printer aria-hidden="true" />
      )}
      {busy ? "Preparando PDF…" : readyFile ? "Compartir PDF" : "Imprimir o guardar PDF"}
    </Button>
  );
}
