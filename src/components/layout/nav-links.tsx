"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import { NavIcon } from "./nav-icon";
import type { NavItem } from "./navigation";

function isActive(pathname: string, href: string, items: NavItem[]) {
  if (href === "/") return pathname === "/";
  if (pathname !== href && !pathname.startsWith(`${href}/`)) return false;
  // Si otro enlace es más específico (p. ej. /servicios/nuevo), gana ese.
  return !items.some(
    (item) =>
      item.href.length > href.length &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
}

export function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href, items);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-base font-medium text-brand-ink/75 transition-colors outline-none",
                "hover:bg-muted hover:text-brand-ink focus-visible:ring-3 focus-visible:ring-ring/50",
                active && "bg-muted text-brand-ink",
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="brand-stripe absolute inset-y-2 left-0 w-1 rounded-full"
                />
              )}
              <NavIcon name={item.icon} className="size-5 shrink-0" />
              <span className="min-w-0 flex-1">{item.label}</span>
              {item.badge ? <NavBadge count={item.badge} /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Número rojo junto al enlace (p. ej. tickets por atender). */
export function NavBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-6 shrink-0 items-center justify-center rounded-full bg-red-700 px-1.5 text-sm leading-6 font-bold text-white tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> por atender</span>
    </span>
  );
}
