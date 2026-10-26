import { HomePanel, HomePanelEmpty } from "@/components/shared/home-panel";

import { listRecentServices, listServicesWithoutReceipts } from "../queries";

import { ServiceBriefList } from "./service-brief-list";

const PENDING_LIMIT = 50;

/**
 * Servicios a los que les falta la factura. Admin y gerente ven todos (con quién
 * los capturó); el capturista, los suyos (RLS).
 */
export async function PendingReceiptsPanel({ showAuthor, title }: { showAuthor: boolean; title: string }) {
  const { services, total } = await listServicesWithoutReceipts(PENDING_LIMIT);

  return (
    <HomePanel title={title} count={total} description={total > 0 ? "Toca uno para subirle su factura." : undefined}>
      {total === 0 ? (
        <HomePanelEmpty>Todos los servicios tienen su factura.</HomePanelEmpty>
      ) : (
        <>
          <div className="max-h-[24rem] overflow-y-auto overscroll-contain">
            <ServiceBriefList services={services} showAuthor={showAuthor} />
          </div>
          {total > PENDING_LIMIT && (
            <p className="mt-2 text-sm text-muted-foreground">
              Se muestran los {PENDING_LIMIT} más recientes de {total}.
            </p>
          )}
        </>
      )}
    </HomePanel>
  );
}

/** Los últimos servicios que capturó el usuario (Inicio del capturista). */
export async function RecentServicesPanel() {
  const services = await listRecentServices(5);

  return (
    <HomePanel title="Tus últimos servicios">
      {services.length === 0 ? (
        <p className="py-6 text-muted-foreground">Aún no has registrado servicios.</p>
      ) : (
        <ServiceBriefList services={services} showReceipts />
      )}
    </HomePanel>
  );
}

export function HomePanelSkeleton() {
  return <div className="h-64 animate-pulse rounded-xl bg-muted" aria-busy="true" aria-label="Cargando" />;
}
