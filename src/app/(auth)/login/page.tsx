import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";

import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-brand-ink text-white lg:flex lg:flex-col lg:justify-end lg:p-14"
      >
        <div className="brand-stripe absolute inset-y-0 right-0 w-2" />
        <p className="max-w-md font-heading text-5xl leading-[1.05] font-semibold text-balance">
          Cada reparación, con su comprobante y su unidad.
        </p>
        <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/70">
          Registra servicios y gastos desde el taller y consulta cuánto se
          invierte en cada unidad de la flotilla.
        </p>
      </section>

      <section className="flex flex-col items-center justify-center bg-white px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <Image
            src="/brand/logo.png"
            alt="Baja Wastewater Solutions"
            width={397}
            height={141}
            priority
            className="mb-10 h-auto w-48"
          />
          <h1 className="text-3xl font-semibold">Iniciar sesión</h1>
          <p className="mt-2 text-muted-foreground">
            Usa el correo y la contraseña que te dio el administrador.
          </p>
          {/* useSearchParams en el formulario requiere un límite de Suspense. */}
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
