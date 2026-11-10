import { BarChart3, ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  HomePanelSkeleton,
  NoShopEntryPanel,
  PendingReceiptsPanel,
  RecentServicesPanel,
} from "@/features/servicios/components/home-panels";
import { MaintenanceDuePanel } from "@/features/mantenimientos/components/maintenance-due-panel";
import { UnitsInShopPanel } from "@/features/unidades/components/units-in-shop";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { todayInTijuana } from "@/lib/utils/format";

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
        {/* Dos columnas como el Inicio del admin: lo suyo (facturas y últimos) a la
            izquierda y Mantenimientos a la derecha. Con tres tarjetas sueltas en una
            cuadrícula de dos, la tercera quedaba sola y desfasada (lo reportó el usuario). */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <Suspense fallback={<HomePanelSkeleton />}>
              <PendingReceiptsPanel title="Te falta subir factura" showAuthor={false} />
            </Suspense>
            <Suspense fallback={<HomePanelSkeleton />}>
              <RecentServicesPanel />
            </Suspense>
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <Suspense fallback={<HomePanelSkeleton />}>
              <MaintenanceDuePanel openUnits={false} />
            </Suspense>
          </div>
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <Suspense fallback={<HomePanelSkeleton />}>
          <PendingReceiptsPanel title="Servicios sin factura" showAuthor />
        </Suspense>
        <div className="flex min-w-0 flex-col gap-6">
          <Suspense fallback={<HomePanelSkeleton />}>
            <MaintenanceDuePanel openUnits />
          </Suspense>
          <Suspense fallback={<HomePanelSkeleton />}>
            <UnitsInShopPanel today={todayInTijuana()} />
          </Suspense>
          {user.role === "admin" && (
            <Suspense fallback={<HomePanelSkeleton />}>
              <NoShopEntryPanel today={todayInTijuana()} />
            </Suspense>
          )}
        </div>
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
