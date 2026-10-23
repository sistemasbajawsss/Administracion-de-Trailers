import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireRole } from "@/features/auth/components/require-role";
import { CatalogManager } from "@/features/catalogos/components/catalog-manager";
import { listCatalogs } from "@/features/catalogos/queries";
import { CATALOG_KINDS, CATALOG_LABELS } from "@/features/catalogos/types";

export const metadata: Metadata = { title: "Catálogos" };

async function Catalogs() {
  const catalogs = await listCatalogs();

  return (
    <Tabs defaultValue="choferes">
      <TabsList className="mb-6 h-11 w-full bg-muted sm:w-auto">
        {CATALOG_KINDS.map((kind) => (
          <TabsTrigger key={kind} value={kind} className="min-h-9 px-4 text-base">
            {CATALOG_LABELS[kind].title}
          </TabsTrigger>
        ))}
      </TabsList>
      {CATALOG_KINDS.map((kind) => (
        <TabsContent key={kind} value={kind}>
          <CatalogManager kind={kind} items={catalogs[kind]} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default function CatalogosPage() {
  return (
    <RequireRole role="admin">
      <PageHeader
        title="Catálogos"
        description="Choferes, categorías de gasto y proveedores. Lo que se desactiva deja de aparecer en la captura, pero su historial se conserva."
      />
      <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-muted" aria-label="Cargando catálogos" />}>
        <Catalogs />
      </Suspense>
    </RequireRole>
  );
}
