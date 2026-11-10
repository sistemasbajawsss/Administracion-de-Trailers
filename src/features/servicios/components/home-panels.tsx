import { HomePanel, HomePanelEmpty } from "@/components/shared/home-panel";

import { listRecentServices, listServicesWithoutReceipts, listServicesWithoutShopEntry } from "../queries";

import { HomeListDialog } from "./home-list-dialog";
import { ServiceBriefList } from "./service-brief-list";

/**
 * Renglones en las tarjetas de Inicio: pocos para que el Inicio quepa en la
 * pantalla de la computadora sin bajar (lo pidió el usuario); el resto, en
 * "Ver los N" (ventana con su propio scroll).
 */
export const HOME_ROWS = 3;

/**
 * Servicios a los que les falta la factura. Admin y gerente ven todos (con quién
 * los capturó); el capturista, los suyos (RLS).
 */
export async function PendingReceiptsPanel({
  showAuthor,
  title,
  canUpload = true,
  rows = HOME_ROWS,
  className,
}: {
  showAuthor: boolean;
  title: string;
  /** El gerente solo consulta: no se le invita a subir facturas. */
  canUpload?: boolean;
  rows?: number;
  className?: string;
}) {
  const { services, total } = await listServicesWithoutReceipts(rows);

  return (
    <HomePanel
      title={title}
      count={total}
      className={className}
      description={total > 0 ? (canUpload ? "Toca uno para subirle su factura." : "Toca uno para ver su detalle.") : undefined}
      footer={
        total > rows ? (
          <HomeListDialog
            list="sin_factura"
            title={title}
            description={canUpload ? "Del capturado más reciente al más viejo. Toca uno para subirle su factura." : "Del capturado más reciente al más viejo. Toca uno para ver su detalle."}
            total={total}
            initialItems={services}
            showAuthor={showAuthor}
          />
        ) : undefined
      }
    >
      {total === 0 ? (
        <HomePanelEmpty>Todos los servicios tienen su factura.</HomePanelEmpty>
      ) : (
        <ServiceBriefList services={services} showAuthor={showAuthor} />
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
  const { services, total } = await listServicesWithoutShopEntry(daysAgo(today, NO_ENTRY_DAYS), HOME_ROWS);

  return (
    <HomePanel
      title="Sin entrada a taller"
      count={total}
      description={`Últimos ${NO_ENTRY_DAYS} días, con su motivo.`}
      footer={
        total > HOME_ROWS ? (
          <HomeListDialog
            list="sin_entrada"
            title="Sin entrada a taller"
            description={`Servicios de los últimos ${NO_ENTRY_DAYS} días que no pasaron por Taller, del más reciente al más viejo.`}
            total={total}
            initialItems={services}
            showAuthor
            showNoEntryReason
          />
        ) : undefined
      }
    >
      {total === 0 ? (
        <HomePanelEmpty>Todos los servicios recientes pasaron por Taller.</HomePanelEmpty>
      ) : (
        <ServiceBriefList services={services} showAuthor showNoEntryReason />
      )}
    </HomePanel>
  );
}

/** Los últimos servicios que capturó el usuario (Inicio del capturista). */
export async function RecentServicesPanel() {
  const services = await listRecentServices(HOME_ROWS);

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
