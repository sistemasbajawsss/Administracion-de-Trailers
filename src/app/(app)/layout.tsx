import { Suspense } from "react";

import {
  AppNavigation,
  AppNavigationFallback,
} from "@/components/layout/app-navigation";
import { signOut } from "@/features/auth/actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:pl-64">
      <Suspense fallback={<AppNavigationFallback />}>
        <AppNavigation signOutAction={signOut} />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}
