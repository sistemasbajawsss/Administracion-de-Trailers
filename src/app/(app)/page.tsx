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
        {/* Cuadrícula de 2 x 2 sin scroll en la computadora (lo pidió el usuario):
            lo suyo (facturas y últimos) a la izquierda y Mantenimientos a la derecha,
            de los dos renglones de alto y con más renglones para llenarla. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<HomePanelSkeleton />}>
            <PendingReceiptsPanel title="Te falta subir factura" showAuthor={false} />
          </Suspense>
          <Suspense fallback={<HomePanelSkeleton />}>
            <MaintenanceDuePanel openUnits={false} rows={7} className="lg:row-span-2" />
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
      {/* Cuadrícula de 2 x 2 que cabe en la pantalla de la computadora sin bajar
          (lo pidió el usuario): las tarjetas de un renglón miden lo mismo y su
          "Ver los N" queda alineado abajo; lo demás, en esa ventana o página.
          Izquierda, servicios (sin factura, sin entrada a taller); derecha,
          unidades (mantenimientos, en taller). El gerente no ve "Sin entrada a
          taller": su tarjeta de facturas ocupa los dos renglones. En celular,
          una columna. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-2">
        {user.role === "admin" ? (
          <>
            <Suspense fallback={<HomePanelSkeleton />}>
              <PendingReceiptsPanel title="Servicios sin factura" showAuthor />
            </Suspense>
            <Suspense fallback={<HomePanelSkeleton />}>
              <NoShopEntryPanel today={todayInTijuana()} />
            </Suspense>
          </>
        ) : (
          <Suspense fallback={<HomePanelSkeleton />}>
            <PendingReceiptsPanel title="Servicios sin factura" showAuthor canUpload={false} rows={7} className="lg:row-span-2" />
          </Suspense>
        )}
        <Suspense fallback={<HomePanelSkeleton />}>
          <MaintenanceDuePanel openUnits />
        </Suspense>
        <Suspense fallback={<HomePanelSkeleton />}>
          <UnitsInShopPanel today={todayInTijuana()} />
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
