import { cn } from "cn";
import { ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/get-current-user";

async function Welcome() {
  const user = await getCurrentUser();
  const firstName = user.name.split(" ")[0];

  return user.role === "admin" ? (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="Aquí verás cuánto se ha invertido en cada camión."
      />
      <EmptyState
        title="Todavía no hay camiones registrados"
        description="Cuando se den de alta los camiones y se capturen servicios, aquí aparecerá el resumen de gastos."
      />
    </>
  ) : (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="Registra los servicios y gastos de cada camión con su comprobante."
      />
      <EmptyState
        title="Aún no has registrado servicios"
        description="Tus registros aparecerán aquí después de capturar el primero."
        action={
          <Link
            href="/servicios/nuevo"
            className={cn(buttonVariants({ size: "touch" }), "w-full sm:w-auto")}
          >
            <ClipboardPlus aria-hidden="true" />
            Registrar servicio
          </Link>
        }
      />
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageHeader title="Inicio" />}>
      <Welcome />
    </Suspense>
  );
}
