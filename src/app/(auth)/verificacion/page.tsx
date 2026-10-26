import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { TotpForm } from "@/features/auth/components/totp-form";
import { getMfaFactorState } from "@/features/auth/queries";
import { getSessionUser } from "@/lib/auth/get-current-user";
import { requiresMfa } from "@/lib/auth/types";

export const metadata: Metadata = {
  title: "Verificación en dos pasos",
};

async function VerificationContent() {
  const user = await getSessionUser();
  if (!requiresMfa(user.role) || user.mfaVerified) {
    redirect("/");
  }
  const state = await getMfaFactorState();
  return <TotpForm mode={state.kind} email={user.email} />;
}

function VerificationSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-hidden="true">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export default function VerificationPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-brand-ink text-white lg:flex lg:flex-col lg:justify-end lg:p-14"
      >
        <div className="brand-stripe absolute inset-y-0 right-0 w-2" />
        <p className="max-w-md font-heading text-5xl leading-[1.05] font-semibold text-balance">
          Tu cuenta ve lo que se gasta en toda la flotilla.
        </p>
        <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/70">
          Por eso, además de la contraseña, pedimos el código que genera tu
          celular. Sin él, nadie entra aunque sepa tu contraseña.
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
          <h1 className="text-3xl font-semibold">Verificación en dos pasos</h1>
          <Suspense fallback={<VerificationSkeleton />}>
            <VerificationContent />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
