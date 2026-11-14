import { BarChart3, ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { MonthCloseBanner } from "@/features/cierres/components/month-close-banner";
import {
  HomePanelSkeleton,
  NoShopEntryPanel,
  PendingReceiptsPanel,
  RecentServicesPanel,
} from "@/features/servicios/components/home-panels";
import { WeeklyMileageBanner } from "@/features/kilometraje/components/weekly-mileage-banner";
import { AdminTicketsBanner, TicketsHomePanel } from "@/features/tickets/components/tickets-home";
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
  const now = new Date().toISOString();

  if (user.role === "capturista") {
    return (
      <>
        <PageHeader title={`Hola, ${firstName}`} description="Registra los servicios con su comprobante." />
        {newServiceLink("mb-6 h-14 w-full px-6 text-lg sm:w-auto")}
        {/* En los días de registro del kilometraje, mientras falten unidades (5H): arriba de la cuadrícula, sin moverla. */}
        <Suspense fallback={null}>
          <WeeklyMileageBanner />
        </Suspense>
        {/* Cierre de mes (5I): del día 1 al 4, el mes pasado todavía se puede completar. */}
        <Suspense fallback={null}>
          <MonthCloseBanner />
        </Suspense>
        {/* Cuadrícula de 2 x 2 sin scroll en la computadora (lo pidió el usuario):
            lo suyo (facturas y últimos) a la izquierda; a la derecha, Tickets de
            taller (5H) arriba y Mantenimientos abajo. En celular, Tickets va
            segundo, después de las facturas. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<HomePanelSkeleton />}>
            <PendingReceiptsPanel title="Te falta subir factura" showAuthor={false} />
          </Suspense>
          <Suspense fallback={<HomePanelSkeleton />}>
            <TicketsHomePanel user={user} now={now} />
          </Suspense>
          <Suspense fallback={<HomePanelSkeleton />}>
            <RecentServicesPanel />
          </Suspense>
          <Suspense fallback={<HomePanelSkeleton />}>
            <MaintenanceDuePanel openUnits={false} />
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
          taller": en su lugar, Tickets de taller (5H). En celular, una columna. */}
      {/* En los días de registro del kilometraje, mientras falten unidades (5H, solo admin): arriba de la cuadrícula, sin moverla. */}
      {user.role === "admin" && (
        <Suspense fallback={null}>
          <WeeklyMileageBanner />
        </Suspense>
      )}
      {/* Admin: tickets pendientes y sus rechazos sin ver, en renglones arriba de la cuadrícula (ya tiene 4 tarjetas). */}
      {user.role === "admin" && (
        <Suspense fallback={null}>
          <AdminTicketsBanner user={user} />
        </Suspense>
      )}
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
          <>
            <Suspense fallback={<HomePanelSkeleton />}>
              <PendingReceiptsPanel title="Servicios sin factura" showAuthor canUpload={false} />
            </Suspense>
            <Suspense fallback={<HomePanelSkeleton />}>
              <TicketsHomePanel user={user} now={now} />
            </Suspense>
          </>
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
