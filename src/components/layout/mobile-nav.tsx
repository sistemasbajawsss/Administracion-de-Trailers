"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavBadge, NavLinks } from "./nav-links";
import type { NavItem } from "./navigation";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pending = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-touch"
            className="relative"
            aria-label={pending > 0 ? `Abrir menú (${pending} por atender)` : "Abrir menú"}
          />
        }
      >
        <Menu />
        {pending > 0 && <NavBadge count={pending} className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-5 px-1 text-xs leading-5" />}
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-white p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-heading text-xl">Menú</SheetTitle>
          <SheetDescription className="sr-only">
            Navegación principal
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Principal" className="px-3">
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
