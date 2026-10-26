import { NextResponse } from "next/server";
import { z } from "zod";

import { getReceiptFile } from "@/features/comprobantes/queries";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { RECEIPTS_BUCKET } from "@/lib/supabase/storage";

/** La URL firmada solo vive lo necesario para que el navegador la abra. */
const SIGNED_URL_SECONDS = 60;

const notFound = () =>
  new NextResponse("Comprobante no encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Abre el archivo de un comprobante: revisa sesión y RLS en cada petición y
 * redirige a una URL firmada de 60 segundos. Así ningún enlace guardado o
 * compartido sirve sin sesión. ?descargar=1 lo baja con su nombre.
 */
export async function GET(request: Request, { params }: RouteContext<"/comprobantes/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  await getCurrentUser();
  const file = await getReceiptFile(id);
  if (!file) return notFound();

  const download = new URL(request.url).searchParams.get("descargar") === "1";
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(file.path, SIGNED_URL_SECONDS, download ? { download: file.fileName } : undefined);
  if (error || !data) return notFound();

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
