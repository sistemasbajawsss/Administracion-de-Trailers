import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Origen de Supabase (https://<ref>.supabase.co): el único servidor ajeno con el
// que la página puede hablar.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

/**
 * Content-Security-Policy: qué puede cargar y a dónde puede enviar datos la página.
 * - script-src sin dominios ajenos: un <script src="..."> inyectado no carga.
 *   'unsafe-inline' es necesario porque Next.js mete scripts en línea y, con
 *   Cache Components, el esqueleto estático no puede llevar nonce.
 * - connect-src e img-src cerrados: aunque corriera un script ajeno, no tendría a
 *   dónde mandar los datos. Y la cookie de sesión es httpOnly: no la puede leer.
 * - frame-ancestors 'none': nadie puede meter la app dentro de otra página.
 * Desarrollo: React necesita eval para depurar y Turbopack un websocket.
 * Sección 3: ajustar aquí para el visor y la compresión de comprobantes.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigin}${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Dos años solo por HTTPS, también en subdominios.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Cámara solo para la propia app (fotos de tickets); lo demás, apagado.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // No anunciar con qué está hecha la app.
  poweredByHeader: false,
  // El indicador de desarrollo tapaba el menú de usuario (abajo a la izquierda).
  devIndicators: { position: "bottom-right" },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
