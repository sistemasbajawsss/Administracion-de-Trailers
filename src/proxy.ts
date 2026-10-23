import { NextResponse, type NextRequest } from "next/server";

import { isMockAuthEnabled } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Sección 0A: sin proyecto de Supabase todavía. Se elimina en 0B.
  if (isMockAuthEnabled()) {
    return NextResponse.next({ request });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo excepto archivos estáticos, optimización de imágenes y assets públicos.
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
