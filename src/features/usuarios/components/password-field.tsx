"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { generatePassword } from "../schemas";

/** Copia al portapapeles con aviso. */
export async function copyText(text: string, label = "Copiado") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
    return true;
  } catch {
    toast.error("No se pudo copiar. Selecciónalo y cópialo a mano.");
    return false;
  }
}

/**
 * Contraseña visible (el admin se la va a pasar a la persona) con "Generar" y
 * "Copiar". Letra monoespaciada para no confundir caracteres al dictarla.
 */
export function PasswordField({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="new-password"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={invalid}
        className="h-12 flex-1 bg-white font-mono text-base"
      />
      <Button
        type="button"
        variant="outline"
        size="touch"
        onClick={() => {
          onChange(generatePassword());
          setCopied(false);
        }}
      >
        <Sparkles aria-hidden="true" />
        Generar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-touch"
        aria-label="Copiar contraseña"
        disabled={!value}
        onClick={async () => setCopied(await copyText(value, "Contraseña copiada"))}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/** Datos para pasarle a la persona, con un solo "Copiar todo". Se muestran una vez. */
export function CredentialsCard({ email, password }: { email: string; password: string }) {
  const text = `Correo: ${email}\nContraseña: ${password}`;
  return (
    <div className="space-y-3">
      <dl className="rounded-lg border bg-muted/40 p-4">
        <dt className="text-sm text-muted-foreground">Correo</dt>
        <dd className="mb-2 font-medium break-all">{email}</dd>
        <dt className="text-sm text-muted-foreground">Contraseña</dt>
        <dd className="font-mono text-lg break-all select-all">{password}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        Pásale estos datos por un medio seguro. La contraseña no se vuelve a mostrar; si se pierde, se
        restablece.
      </p>
      <Button type="button" variant="outline" size="touch" className="w-full" onClick={() => copyText(text, "Datos copiados")}>
        <Copy aria-hidden="true" />
        Copiar correo y contraseña
      </Button>
    </div>
  );
}
