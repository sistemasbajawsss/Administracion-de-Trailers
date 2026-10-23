import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/app-shell/page-header";

export const metadata: Metadata = { title: "Registrar servicio" };

export default function NuevoServicioPage() {
  return (
    <>
      <PageHeader
        title="Registrar servicio"
        description="Elige el camión, captura los gastos y adjunta el comprobante."
      />
      <EmptyState
        title="La captura aún no está disponible"
        description="El formulario de servicios se habilita cuando existan camiones registrados."
      />
    </>
  );
}
