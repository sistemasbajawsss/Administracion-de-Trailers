"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionResult } from "@/lib/action-result";
import { ROLE_LABELS, type CurrentUser } from "@/lib/auth/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function UserMenu({
  user,
  signOutAction,
  compact = false,
}: {
  user: CurrentUser;
  /** Server Action de cierre de sesión; la inyecta app/ para no importar features desde components. */
  signOutAction: () => Promise<ActionResult>;
  compact?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const toastId = toast.loading("Cerrando sesión…");
      try {
        const result = await signOutAction();
        if (!result.ok) {
          toast.error(result.error, { id: toastId });
          return;
        }
        // Navegación completa: limpia la memoria del navegador de la sesión anterior.
        window.location.replace("/login");
      } catch {
        toast.error("No se pudo cerrar la sesión. Inténtalo de nuevo.", { id: toastId });
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menú de usuario"
        className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar className="size-9">
          <AvatarFallback className="bg-brand-ink font-medium text-white">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        {!compact && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-sm text-muted-foreground">
                {ROLE_LABELS[user.role]}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} disabled={isPending} className="min-h-11">
          <LogOut aria-hidden="true" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
