"use client";

import { KeyRound, MoreHorizontal, Pencil, Search, UserCheck, UserPlus, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/auth/types";
import { formatDateTime } from "@/lib/utils/format";

import { setUserActive } from "../actions";
import type { UserListItem } from "../types";

import { ResetPasswordDialog } from "./reset-password-dialog";
import { UserFormDialog } from "./user-form-dialog";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; user: UserListItem }
  | { kind: "password"; user: UserListItem }
  | { kind: "toggle"; user: UserListItem };

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Usuarios: buscador, lista y acciones (editar, contraseña, desactivar / reactivar). */
export function UsersView({ users, currentUserId }: { users: UserListItem[]; currentUserId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [isPending, startTransition] = useTransition();
  const close = () => setDialog(null);

  const q = normalize(query.trim());
  const visible = q ? users.filter((u) => normalize(`${u.name} ${u.email} ${ROLE_LABELS[u.role]}`).includes(q)) : users;

  function toggleActive(user: UserListItem) {
    startTransition(async () => {
      try {
        const result = await setUserActive(user.id, !user.active);
        if (!result.ok) return void toast.error(result.error);
        toast.success(user.active ? `${user.name} ya no puede entrar` : `${user.name} puede volver a entrar`);
        close();
        router.refresh();
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Buscar por nombre, correo o rol"
            aria-label="Buscar usuarios"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 bg-white pl-10 text-base"
          />
        </div>
        <Button size="touch" onClick={() => setDialog({ kind: "create" })}>
          <UserPlus aria-hidden="true" />
          Nuevo usuario
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nadie coincide con la búsqueda" description="Prueba con otra parte del nombre o del correo." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-white">
          {visible.map((user) => {
            const isMe = user.id === currentUserId;
            return (
              <li key={user.id} className={`flex items-center gap-4 px-4 py-3 sm:px-5 ${user.active ? "" : "bg-muted/40"}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`font-medium ${user.active ? "" : "text-muted-foreground line-through decoration-1"}`}>{user.name}</span>
                    {isMe && <span className="text-sm text-muted-foreground">(tú)</span>}
                    <span className="inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium">{ROLE_LABELS[user.role]}</span>
                    {!user.active && (
                      <span className="inline-flex h-6 items-center rounded-full border border-destructive/30 bg-destructive/5 px-2 text-xs font-medium text-destructive">
                        Desactivado
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.lastSignInAt ? `Último acceso: ${formatDateTime(user.lastSignInAt)}` : "Todavía no entra"}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Acciones para ${user.name}`}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <MoreHorizontal className="size-5" aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem className="min-h-11" onClick={() => setDialog({ kind: "edit", user })}>
                      <Pencil aria-hidden="true" />
                      Editar nombre y rol
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-11" onClick={() => setDialog({ kind: "password", user })}>
                      <KeyRound aria-hidden="true" />
                      Restablecer contraseña
                    </DropdownMenuItem>
                    {!isMe && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={`min-h-11 ${user.active ? "text-destructive" : ""}`}
                          onClick={() => setDialog({ kind: "toggle", user })}
                        >
                          {user.active ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
                          {user.active ? "Desactivar" : "Reactivar"}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.kind === "create" && <UserFormDialog open onOpenChange={(open) => !open && close()} />}
      {dialog?.kind === "edit" && <UserFormDialog open user={dialog.user} onOpenChange={(open) => !open && close()} />}
      {dialog?.kind === "password" && <ResetPasswordDialog open user={dialog.user} onOpenChange={(open) => !open && close()} />}
      {dialog?.kind === "toggle" && (
        <AlertDialog open onOpenChange={(open) => !open && close()}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-heading text-xl">
                {dialog.user.active ? `¿Desactivar a ${dialog.user.name}?` : `¿Reactivar a ${dialog.user.name}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {dialog.user.active
                  ? "Ya no podrá entrar y, si tiene la sesión abierta, deja de ver y registrar todo al instante. Sus servicios se conservan. Se puede reactivar después."
                  : "Podrá volver a entrar con su contraseña de siempre, con el mismo rol."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
              <Button
                variant={dialog.user.active ? "destructive" : "default"}
                size="touch"
                disabled={isPending}
                onClick={() => toggleActive(dialog.user)}
              >
                {dialog.user.active ? "Desactivar" : "Reactivar"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
