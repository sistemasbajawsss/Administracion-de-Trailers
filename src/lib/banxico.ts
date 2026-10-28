import "server-only";

import { normalizeRate } from "@/lib/utils/format";

/**
 * Tipo de cambio FIX por fecha de liquidación: para cada día, el que publicó el
 * DOF el día hábil anterior (regla de contabilidad). Trae dato también en fines
 * de semana y festivos. No confundir con SF43718 (fecha de determinación), que
 * va un día hábil adelantada.
 */
const FIX_SERIES = "SF60653";
const API_URL = "https://www.banxico.org.mx/SieAPIRest/service/v1/series";

export type FixRate = { rate: string; date: string };

type BanxicoResponse = {
  bmx?: { series?: { datos?: { fecha: string; dato: string }[] }[] };
};

/** "2026-10-27" − n días → "2026-10-17". Fechas en UTC para no moverlas por zona horaria. */
function daysBefore(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/**
 * Tipo de cambio que aplica en la fecha dada (publicado en el DOF el día hábil
 * anterior). Si esa fecha aún no tiene dato, el más reciente anterior. null si
 * no hay token, Banxico no responde o no hay dato: entonces se escribe a mano.
 * Token gratuito: https://www.banxico.org.mx/SieAPIRest/service/v1/token
 */
export async function getFixRate(date: string): Promise<FixRate | null> {
  const token = process.env.BANXICO_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch(`${API_URL}/${FIX_SERIES}/datos/${daysBefore(date, 10)}/${date}`, {
      headers: { "Bmx-Token": token, Accept: "application/json" },
      // Un dato publicado no cambia: se guarda medio día en el caché de Next.js.
      next: { revalidate: 43200 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as BanxicoResponse;
    const data = body.bmx?.series?.[0]?.datos ?? [];
    // Vienen del más viejo al más nuevo; "N/E" = sin dato.
    for (let i = data.length - 1; i >= 0; i--) {
      const rate = normalizeRate(data[i]!.dato);
      if (rate) {
        const [d, m, y] = data[i]!.fecha.split("/");
        return { rate, date: `${y}-${m}-${d}` };
      }
    }
    return null;
  } catch {
    return null;
  }
}
