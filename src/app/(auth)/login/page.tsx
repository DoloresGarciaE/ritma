import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { isGoogleEnabled } from "@/lib/auth";
import { toSocialError } from "@/lib/auth-errors";
import { safeInternalPath } from "@/lib/landing";

import { AuthForm } from "../_components/auth-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

/**
 * `error`: lo que falla en el ida y vuelta con Google vuelve acá como `?error=<código>`.
 * `next`: a dónde volver después de entrar (S7: la invitación) — se sanea siempre.
 */
type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { error, next: rawNext } = await searchParams;
  const next = safeInternalPath(rawNext);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-medium text-text">Entrá a Ritma</h1>
        <p className="text-text-secondary">Tu agenda, tus alumnos y tus cobranzas.</p>
      </header>

      <AuthForm
        mode="login"
        googleEnabled={isGoogleEnabled}
        socialError={toSocialError(error)}
        next={next}
      />

      <p className="text-center text-sm text-text-secondary">
        ¿Todavía no tenés cuenta?{" "}
        <Link
          href={next ? `/registro?next=${encodeURIComponent(next)}` : "/registro"}
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          Creá una
        </Link>
      </p>
    </>
  );
}
