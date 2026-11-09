import Link from "next/link";

import { formatDate, formatKm } from "@/lib/utils/format";

import type { Maintenance } from "../types";

/**
 * "Última vez: 09/11/2026, a los 272,291 km", con enlace al correctivo que lo
 * cumplió. El enlace solo se muestra a quien ve todos los servicios (el
 * capturista solo ve los suyos).
 */
export function MaintenanceLastTime({ item, linkService }: { item: Maintenance; linkService: boolean }) {
  return (
    <p className="text-sm text-muted-foreground">
      Última vez: {formatDate(item.lastDate)}
      {item.lastKm !== null && <span className="whitespace-nowrap">, a los {formatKm(item.lastKm)}</span>}
      {item.lastServiceId && linkService && (
        <>
          {" · "}
          <Link
            href={`/servicios/${item.lastServiceId}`}
            className="font-medium whitespace-nowrap text-brand-ink underline underline-offset-4 hover:text-brand-cyan"
          >
            Ver servicio
          </Link>
        </>
      )}
    </p>
  );
}
