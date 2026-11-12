import { Suspense } from "react";

import {
  AppNavigation,
  AppNavigationFallback,
} from "@/components/layout/app-navigation";
import { NavigationTracker } from "@/components/layout/navigation-tracker";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { signOut } from "@/features/auth/actions";
import { TabSessionGuard } from "@/features/auth/components/tab-session-guard";
import { TabSessionScript } from "@/features/auth/components/tab-session-script";
import { TicketsLive } from "@/features/tickets/components/tickets-live";
import { countTicketsNeedingAttention } from "@/features/tickets/queries";
import { canAttendTickets } from "@/features/tickets/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { CurrentUser } from "@/lib/auth/types";

/** Número del menú en Tickets: lo que este usuario tiene que atender (5H, D16). */
async function loadBadges(user: CurrentUser) {
  return { "/tickets": await countTicketsNeedingAttention(user) };
}

/** Escucha los tickets al momento (Realtime) para actualizar el menú, Inicio y Tickets. */
async function LiveTickets() {
  const user = await getCurrentUser();
  return <TicketsLive userId={user.id} notifyNew={canAttendTickets(user)} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:pl-64 print:pl-0">
      {/* Primero que todo: oculta la app antes de pintarla si la pestaña no tiene sesión. */}
      <TabSessionScript />
      <Suspense fallback={<AppNavigationFallback />}>
        <AppNavigation signOutAction={signOut} loadBadges={loadBadges} />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 print:max-w-none print:p-0 xl:has-[[data-wide]]:max-w-none">
        {children}
      </main>
      {/* usePathname es dato de la petición: va dentro de Suspense para no bloquear el prerender. */}
      <Suspense fallback={null}>
        <NavigationTracker />
      </Suspense>
      <Suspense fallback={null}>
        <LiveTickets />
      </Suspense>
      <TabSessionGuard />
      {/* Jalar hacia abajo para actualizar (app instalada) y al volver a la app. */}
      <PullToRefresh />
    </div>
  );
}
