import { cn } from "cn";
import { ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { HomeSummary, HomeSummarySkeleton } from "@/features/dashboard/components/home-summary";
import { getCurrentUser } from "@/lib/auth/get-current-user";

async function Welcome() {
  const user = await getCurrentUser();
  const firstName = user.name.split(" ")[0];

  return user.role !== "capturista" ? (
    <>
      <PageHeader title={`Hola, ${firstName}`} description="Así va el gasto de la flotilla este mes." />
      <Suspense fallback={<HomeSummarySkeleton />}>
        <HomeSummary />
      </Suspense>
    </>
  ) : (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="Registra los servicios y gastos de cada unidad con su comprobante."
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
