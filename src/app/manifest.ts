import type { MetadataRoute } from "next";

/**
 * Manifest de la app instalable: al agregarla a la pantalla de inicio del
 * celular se abre sin la barra del navegador (`standalone`), como una app.
 * Se sirve en /manifest.webmanifest, fuera del proxy de sesión.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Administración Trailers",
    short_name: "Flotilla",
    description: "Reparaciones, gastos y comprobantes de la flotilla.",
    lang: "es-MX",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f7f7",
    theme_color: "#ffffff",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
