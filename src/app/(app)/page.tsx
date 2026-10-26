import { BarChart3, ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  HomePanelSkeleton,
  PendingReceiptsPanel,
  RecentServicesPanel,
} from "@/features/servicios/components/home-panels";
import { UnitsInShopPanel } from "@/features/unidades/components/units-in-shop";
import { getCurrentUser } from "@/lib/auth/get-current-user";

const newServiceLink = (className = "") => (
  <Link href="/servicios/nuevo" className={`${buttonVariants({ size: "touch" })} ${className}`}>
    <ClipboardPlus aria-hidden="true" />
    Registrar servicio
  </Link>
);

async function Welcome() {
  const user = await getCurrentUser();
  const firstName = user.name.split(" ")[0];

  if (user.role === "capturista") {
    return (
      <>
        <PageHeader title={`Hola, ${firstName}`} description="Registra los servicios con su comprobante." />
        {newServiceLink("mb-6 h-14 w-full px-6 text-lg sm:w-auto")}
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Suspense fallback={<HomePanelSkeleton />}>
            <PendingReceiptsPanel title="Te falta subir factura" showAuthor={false} />
          </Suspense>
          <Suspense fallback={<HomePanelSkeleton />}>
            <RecentServicesPanel />
          </Suspense>
        </div>
      </>
    );
  }

  // Admin y gerente: lo que falta por atender.
  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="Lo que falta por atender en la flotilla."
        actions={
          <>
            <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "touch" })}>
              <BarChart3 aria-hidden="true" />
              Ver reportes
            </Link>
            {user.role === "admin" && newServiceLink()}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <Suspense fallback={<HomePanelSkeleton />}>
          <PendingReceiptsPanel title="Servicios sin factura" showAuthor />
        </Suspense>
        <Suspense fallback={<HomePanelSkeleton />}>
          <UnitsInShopPanel />
        </Suspense>
      </div>
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
