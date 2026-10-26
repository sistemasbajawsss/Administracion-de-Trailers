"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  signOut,
  startTotpEnrollment,
  verifyTotp,
  type TotpEnrollment,
} from "@/features/auth/actions";
import { totpCodeSchema, type TotpCodeInput } from "@/features/auth/schemas";

type Mode = "enroll" | "verify";

/** La clave en bloques de 4 para copiarla a mano sin perderse. */
function groupSecret(secret: string) {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export function TotpForm({ mode, email }: { mode: Mode; email: string }) {
  return mode === "enroll" ? <EnrollSteps email={email} /> : <VerifyStep email={email} />;
}

function VerifyStep({ email }: { email: string }) {
  return (
    <>
      <p className="mt-2 text-muted-foreground">
        Abre tu app autenticadora y escribe el código de <strong className="font-medium text-foreground">Flotilla BWS</strong> para {email}.
      </p>
      <CodeForm submitLabel="Verificar y entrar" successMessage="Sesión verificada" />
      <SignOutLink />
    </>
  );
}

function EnrollSteps({ email }: { email: string }) {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [isGenerating, startGenerating] = useTransition();

  function handleGenerate() {
    startGenerating(async () => {
      try {
        const result = await startTotpEnrollment();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setEnrollment(result.data);
      } catch {
        toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  }

  return (
    <>
      <p className="mt-2 text-muted-foreground">
        Es la primera vez que entras con {email}. Configúralo una sola vez; toma
        un par de minutos.
      </p>

      <ol className="mt-8 space-y-8">
        <Step number={1} title="Instala una app autenticadora en tu celular">
          <p className="text-sm text-muted-foreground">
            Google Authenticator o Microsoft Authenticator, gratis en la tienda de
            tu celular.
          </p>
        </Step>

        <Step number={2} title="Escanea el código QR con la app">
          {enrollment ? (
            <div className="space-y-4">
              {/* El QR llega de Supabase como SVG en data URI: next/image no aporta nada aquí. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enrollment.qrCode}
                alt="Código QR para la app autenticadora"
                width={192}
                height={192}
                className="size-48 rounded-md border bg-white p-2"
              />
              <div className="text-sm">
                <p className="text-muted-foreground">
                  ¿No puedes escanearlo? En la app elige “Ingresar clave” y escribe:
                </p>
                <p className="mt-1 font-medium tracking-wide break-all select-all">
                  {groupSecret(enrollment.secret)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Si quieres un respaldo por si pierdes el celular, escanéalo también
                con un segundo celular antes de continuar.
              </p>
            </div>
          ) : (
            <Button
              type="button"
              size="touch"
              variant="outline"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isGenerating ? "Generando…" : "Mostrar código QR"}
            </Button>
          )}
        </Step>

        <Step number={3} title="Escribe el código que muestra la app">
          {enrollment ? (
            <CodeForm submitLabel="Activar y entrar" successMessage="Verificación activada" />
          ) : (
            <p className="text-sm text-muted-foreground">Primero muestra el código QR.</p>
          )}
        </Step>
      </ol>

      <SignOutLink />
    </>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-full bg-brand-ink font-heading text-sm font-semibold text-white"
      >
        {number}
      </span>
      <div className="space-y-3 pt-1">
        <h2 className="leading-snug font-medium">{title}</h2>
        {children}
      </div>
    </li>
  );
}

function CodeForm({ submitLabel, successMessage }: { submitLabel: string; successMessage: string }) {
  const router = useRouter();
  const form = useForm<TotpCodeInput>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: "" },
  });

  async function onSubmit(values: TotpCodeInput) {
    try {
      const result = await verifyTotp(values);
      if (!result.ok) {
        toast.error(result.error);
        form.setValue("code", "");
        form.setFocus("code");
        return;
      }
      toast.success(successMessage);
      router.replace("/");
      router.refresh();
    } catch {
      toast.error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
      <Controller
        name="code"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="code">Código de 6 dígitos</FieldLabel>
            <Input
              {...field}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
                field.onChange(digits);
                // Con el sexto dígito se envía solo: un toque menos en el celular.
                if (digits.length === 6 && !isSubmitting) {
                  void form.handleSubmit(onSubmit)();
                }
              }}
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="000000"
              aria-invalid={fieldState.invalid}
              disabled={isSubmitting}
              className="h-14 text-center font-heading text-3xl tracking-[0.4em] tabular-nums placeholder:text-muted-foreground/40"
            />
            <FieldDescription>El código cambia cada 30 segundos.</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Button type="submit" size="touch" disabled={isSubmitting} className="w-full">
        {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        {isSubmitting ? "Verificando…" : submitLabel}
      </Button>
    </form>
  );
}

function SignOutLink() {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      try {
        const result = await signOut();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        window.location.replace("/login");
      } catch {
        toast.error("No se pudo cerrar la sesión. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="touch"
      onClick={handleSignOut}
      disabled={isPending}
      className="mt-6 w-full text-muted-foreground"
    >
      {isPending ? "Saliendo…" : "Salir y entrar con otra cuenta"}
    </Button>
  );
}
