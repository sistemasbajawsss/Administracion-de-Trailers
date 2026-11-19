"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/features/auth/actions";
import { loginSchema, type LoginInput } from "@/features/auth/schemas";

import { markTabSession } from "./tab-session-guard";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inactive = searchParams.get("motivo") === "inactivo";

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  // Mientras carga el Inicio, el formulario sigue en "Entrando…" y bloqueado:
  // si se vaciara o se reactivara, parecería que hay que volver a llenarlo.
  const [isEntering, startEntering] = useTransition();
  const { reset } = form;

  // No dejar la contraseña en memoria cuando el login deja de verse
  // (Next puede conservar la pantalla oculta con su estado).
  useEffect(() => () => reset(), [reset]);

  async function onSubmit(values: LoginInput) {
    try {
      const result = await signIn(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      markTabSession();
      toast.success("Sesión iniciada");
      // Una sola petición del Inicio: signIn ya revalida y borra lo guardado de
      // antes, así que no hace falta router.refresh() (pedía el Inicio dos veces).
      startEntering(() => router.replace("/"));
    } catch {
      // También llega aquí cuando el Firewall de Vercel frena el exceso de intentos (429).
      toast.error("No se pudo iniciar sesión. Si hiciste varios intentos, espera un minuto; si no, revisa tu internet.");
    }
  }

  const isBusy = form.formState.isSubmitting || isEntering;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="mt-8"
    >
      {inactive && (
        <p role="alert" className="mb-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Tu usuario está desactivado. Pide al administrador que lo reactive.
        </p>
      )}
      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <Input
                {...field}
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                disabled={isBusy}
                aria-invalid={fieldState.invalid}
                className="h-12 text-base"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Input
                {...field}
                id="password"
                type="password"
                autoComplete="current-password"
                disabled={isBusy}
                aria-invalid={fieldState.invalid}
                className="h-12 text-base"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Button type="submit" size="touch" disabled={isBusy} className="w-full">
          {isBusy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {isBusy ? "Entrando…" : "Entrar"}
        </Button>
      </FieldGroup>
    </form>
  );
}
