import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ShopBoard } from "@/features/taller/components/shop-board";
import { listOpenShopEntries } from "@/features/taller/queries";
import { requireRole } from "@/lib/auth/get-current-user";
import { CAPTURE_ROLES, ROLES } from "@/lib/auth/types";
import { todayInTijuana } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Taller" };

async function Header() {
  const user = await requireRole(ROLES);
  const canCapture = (CAPTURE_ROLES as readonly string[]).includes(user.role);
  return (
    <PageHeader
      title="Taller"
      description="Unidades que están en el taller ahora, con su falla y los días que llevan."
      actions={
        canCapture ? (
          <Link href="/taller/entrada" className={buttonVariants({ size: "touch", className: "w-full sm:w-auto" })}>
            <Plus aria-hidden="true" />
            Registrar entrada a taller
          </Link>
        ) : undefined
      }
    />
  );
}

async function Board() {
  const [user, entries] = await Promise.all([requireRole(ROLES), listOpenShopEntries()]);
  return (
    <ShopBoard
      entries={entries}
      today={todayInTijuana()}
      canCapture={(CAPTURE_ROLES as readonly string[]).includes(user.role)}
    />
  );
}

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Cargando unidades en taller">
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

export default function TallerPage() {
  return (
    <>
      <Suspense fallback={<PageHeader title="Taller" description="Unidades que están en el taller ahora, con su falla y los días que llevan." />}>
        <Header />
      </Suspense>
      <Suspense fallback={<BoardSkeleton />}>
        <Board />
      </Suspense>
    </>
  );
}
