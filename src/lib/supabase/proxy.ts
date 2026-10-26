import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/env";

import { SESSION_COOKIE_OPTIONS } from "./cookie-options";

const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

/**
 * Refresca la sesión de Supabase y protege las rutas privadas.
 * Ante cualquier error (sin variables, sin conexión, sin sesión) redirige a
 * /login: nunca deja pasar por defecto.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  try {
    const { url, publishableKey } = getSupabaseEnv();

    const supabase = createServerClient(url, publishableKey, {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    });

    // getClaims valida el JWT; no confiar en getSession() en el servidor.
    const { data, error } = await supabase.auth.getClaims();
    const isAuthenticated = !error && Boolean(data?.claims?.sub);

    if (!isAuthenticated && !isPublicPath(pathname)) {
      return redirectToLogin(request);
    }

    return response;
  } catch {
    return isPublicPath(pathname) ? response : redirectToLogin(request);
  }
}
