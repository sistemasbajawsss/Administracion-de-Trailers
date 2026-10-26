import { Suspense } from "react";

import {
  AppNavigation,
  AppNavigationFallback,
} from "@/components/layout/app-navigation";
import { NavigationTracker } from "@/components/layout/navigation-tracker";
import { signOut } from "@/features/auth/actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:pl-64 print:pl-0">
      <Suspense fallback={<AppNavigationFallback />}>
        <AppNavigation signOutAction={signOut} />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 print:max-w-none print:p-0">
        {children}
      </main>
      {/* usePathname es dato de la petición: va dentro de Suspense para no bloquear el prerender. */}
      <Suspense fallback={null}>
        <NavigationTracker />
      </Suspense>
    </div>
  );
}
