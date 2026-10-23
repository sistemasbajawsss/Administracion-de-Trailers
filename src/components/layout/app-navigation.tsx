import Image from "next/image";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { NAVIGATION } from "./navigation";
import { UserMenu } from "./user-menu";

function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Ir al inicio" className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Image
        src="/brand/logo.png"
        alt="Baja Wastewater Solutions"
        width={397}
        height={141}
        className={className}
      />
    </Link>
  );
}

/**
 * Barra lateral (escritorio) y barra superior (celular) según el rol.
 * Lee la sesión, por eso se renderiza dentro de un <Suspense>.
 */
export async function AppNavigation() {
  const user = await getCurrentUser();
  const items = NAVIGATION[user.role];

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="px-5 pt-6 pb-8">
          <Logo className="h-auto w-40" />
        </div>
        <nav aria-label="Principal" className="flex-1 px-3">
          <NavLinks items={items} />
        </nav>
        <div className="border-t p-3">
          <UserMenu user={user} />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-white px-2 lg:hidden">
        <MobileNav items={items} />
        <div className="flex flex-1 justify-center">
          <Logo className="h-auto w-28" />
        </div>
        <div className="w-11">
          <UserMenu user={user} compact />
        </div>
      </header>
    </>
  );
}

export function AppNavigationFallback() {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-sidebar lg:block" />
      <header className="sticky top-0 h-16 border-b bg-white lg:hidden" />
    </>
  );
}
