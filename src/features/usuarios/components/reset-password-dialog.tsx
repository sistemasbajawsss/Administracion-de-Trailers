"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

import { resetUserPassword } from "../actions";
import { generatePassword, resetPasswordSchema } from "../schemas";
import type { UserListItem } from "../types";

import { CredentialsCard, PasswordField } from "./password-field";

/** Pone una contraseña nueva y la muestra una vez para pasársela a la persona. */
export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Revisa la contraseña");
    startTransition(async () => {
      try {
        const result = await resetUserPassword(user.id, parsed.data);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Contraseña restablecida para ${user.name}`);
        setDone(true);
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {done ? "Contraseña nueva" : `Restablecer contraseña de ${user.name}`}
          </DialogTitle>
          <DialogDescription>
            {done ? "La anterior ya no sirve." : "La contraseña anterior deja de funcionar en cuanto guardes."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <>
            <CredentialsCard email={user.email} password={password} />
            <DialogFooter>
              <Button size="touch" onClick={() => onOpenChange(false)}>
                Listo
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="reset-password">Contraseña nueva</FieldLabel>
              <PasswordField
                id="reset-password"
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  setError(null);
                }}
                invalid={Boolean(error)}
              />
              <FieldDescription>12 o más caracteres con mayúscula, minúscula, número y símbolo.</FieldDescription>
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" size="touch" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button size="touch" onClick={confirm} disabled={isPending}>
                {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {isPending ? "Guardando…" : "Restablecer contraseña"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
