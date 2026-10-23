import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { RequireRole } from "@/features/auth/components/require-role";
import { DeletedServiceList } from "@/features/servicios/components/deleted-service-list";
import { ServiceListSkeleton } from "@/features/servicios/components/service-list";

export const metadata: Metadata = { title: "Servicios eliminados" };

export default function ServiciosEliminadosPage() {
  return (
    <RequireRole role="admin">
      <Link href="/servicios" className={`${buttonVariants({ variant: "ghost", size: "touch" })} mb-4 -ml-3`}>
        <ChevronLeft aria-hidden="true" />
        Servicios
      </Link>
      <PageHeader
        title="Servicios eliminados"
        description="Cada servicio se puede restaurar tal como estaba, con sus gastos y a nombre de quien lo capturó."
      />
      <Suspense fallback={<ServiceListSkeleton />}>
        <DeletedServiceList />
      </Suspense>
    </RequireRole>
  );
}
