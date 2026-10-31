"use client";

import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Error inesperado en una pantalla de la app (sin conexión con la base, dato que
 * no existe…). Antes se veía la página genérica de Next; aquí la persona puede
 * reintentar o volver al Inicio sin perder la navegación.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="No se pudo cargar esta pantalla"
      description="Puede ser la conexión o un dato que ya no existe. Inténtalo de nuevo; si sigue pasando, vuelve al Inicio."
      action={
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" size="touch" onClick={reset}>
            Intentar de nuevo
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "touch" })}>
            Ir al Inicio
          </Link>
        </div>
      }
    />
  );
}
