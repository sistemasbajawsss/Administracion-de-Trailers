"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/types";

import { createUser, updateUser } from "../actions";
import { createUserSchema, generatePassword, type CreateUserInput } from "../schemas";
import type { UserListItem } from "../types";

import { CredentialsCard, PasswordField } from "./password-field";

const ROLE_HINTS: Record<Role, string> = {
  admin: "Ve y edita todo, incluidos usuarios y catálogos.",
  capturista: "Registra servicios y corrige solo los suyos.",
  gerente: "Solo consulta: unidades, servicios y reportes de todos.",
};

/**
 * Alta (correo, nombre, rol y contraseña inicial) o edición (nombre y rol) de un
 * usuario. Al crear, la contraseña se muestra una vez para pasársela a la persona.
 */
export function UserFormDialog({
  user,
  open,
  onOpenChange,
}: {
  /** Sin usuario: alta. Con usuario: edición. */
  user?: UserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(user);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const form = useForm<CreateUserInput>({
    // En edición no se validan correo ni contraseña (no se cambian aquí).
    resolver: zodResolver(isEdit ? createUserSchema.pick({ name: true, role: true }) : createUserSchema) as never,
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      role: user?.role ?? "capturista",
      password: isEdit ? "" : generatePassword(),
    },
  });

  async function onSubmit(values: CreateUserInput) {
    try {
      if (user) {
        const result = await updateUser(user.id, { name: values.name, role: values.role });
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Cambios guardados para ${values.name}`);
        onOpenChange(false);
      } else {
        const result = await createUser(values);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Usuario creado: ${values.name}`);
        setCreated({ email: values.email.trim().toLowerCase(), password: values.password });
      }
      router.refresh();
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const roleItems = Object.fromEntries(ROLES.map((r) => [r, ROLE_LABELS[r]]));
  const role = useWatch({ control: form.control, name: "role" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {created ? "Usuario creado" : isEdit ? `Editar a ${user?.name}` : "Nuevo usuario"}
          </DialogTitle>
          <DialogDescription>
            {created
              ? "Ya puede entrar con estos datos."
              : isEdit
                ? "El correo no se cambia aquí. Para la contraseña usa “Restablecer contraseña”."
                : "Entra con su correo y esta contraseña; no se manda correo de invitación."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <>
            <CredentialsCard email={created.email} password={created.password} />
            <DialogFooter>
              <Button size="touch" onClick={() => onOpenChange(false)}>
                Listo
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup className="gap-5">
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="user-name">Nombre</FieldLabel>
                    <Input {...field} id="user-name" autoComplete="off" aria-invalid={fieldState.invalid} className="h-12 bg-white text-base" />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              {!isEdit && (
                <Controller
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="user-email">Correo</FieldLabel>
                      <Input
                        {...field}
                        id="user-email"
                        type="email"
                        inputMode="email"
                        autoCapitalize="none"
                        autoComplete="off"
                        aria-invalid={fieldState.invalid}
                        className="h-12 bg-white text-base"
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              )}
              <Controller
                name="role"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="user-role">Rol</FieldLabel>
                    <Select items={roleItems} value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                      <SelectTrigger id="user-role" className="h-12 w-full bg-white text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="min-h-11">
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>{ROLE_HINTS[role]}</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              {!isEdit && (
                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="user-password">Contraseña inicial</FieldLabel>
                      <PasswordField id="user-password" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
                      <FieldDescription>12 o más caracteres con mayúscula, minúscula, número y símbolo.</FieldDescription>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              )}
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" size="touch" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="touch" disabled={isSubmitting}>
                {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
