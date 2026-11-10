import { HomePanel, HomePanelEmpty } from "@/components/shared/home-panel";

import { listRecentServices, listServicesWithoutReceipts, listServicesWithoutShopEntry } from "../queries";

import { ServiceBriefList } from "./service-brief-list";

/** Renglones en las tarjetas de Inicio (sin cuadro con scroll propio: en el celular atrapaba el dedo). */
const PENDING_LIMIT = 10;

/**
 * Servicios a los que les falta la factura. Admin y gerente ven todos (con quién
 * los capturó); el capturista, los suyos (RLS).
 */
export async function PendingReceiptsPanel({
  showAuthor,
  title,
  canUpload = true,
}: {
  showAuthor: boolean;
  title: string;
  /** El gerente solo consulta: no se le invita a subir facturas. */
  canUpload?: boolean;
}) {
  const { services, total } = await listServicesWithoutReceipts(PENDING_LIMIT);

  return (
    <HomePanel title={title} count={total} description={total > 0 ? (canUpload ? "Toca uno para subirle su factura." : "Toca uno para ver su detalle.") : undefined}>
      {total === 0 ? (
        <HomePanelEmpty>Todos los servicios tienen su factura.</HomePanelEmpty>
      ) : (
        <>
          <div>
            <ServiceBriefList services={services} showAuthor={showAuthor} />
          </div>
          {total > PENDING_LIMIT && (
            <p className="mt-2 text-sm text-muted-foreground">
              Se muestran los {PENDING_LIMIT} capturados más recientemente de {total}.
            </p>
          )}
        </>
      )}
    </HomePanel>
  );
}

/** Días hacia atrás del aviso de servicios sin entrada a taller. */
const NO_ENTRY_DAYS = 30;

/** "aaaa-mm-dd" de hace `days` días a partir de `today` (sin zonas horarias). */
function daysAgo(today: string, days: number) {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/**
 * Aviso del admin (5E, D13): servicios de los últimos 30 días que no tuvieron
 * entrada a taller, con el motivo que dio quien los capturó.
 */
export async function NoShopEntryPanel({ today }: { today: string }) {
  const { services, total } = await listServicesWithoutShopEntry(daysAgo(today, NO_ENTRY_DAYS), PENDING_LIMIT);

  return (
    <HomePanel
      title="Sin entrada a taller"
      count={total}
      description={`Servicios de los últimos ${NO_ENTRY_DAYS} días que no pasaron por Taller, con su motivo. No incluye los mantenimientos del taller Realso.`}
    >
      {total === 0 ? (
        <HomePanelEmpty>Todos los servicios recientes pasaron por Taller.</HomePanelEmpty>
      ) : (
        <>
          <div>
            <ServiceBriefList services={services} showAuthor showNoEntryReason />
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
