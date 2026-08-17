import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { isGoogleEnabled } from "@/lib/auth";
import { toSocialError } from "@/lib/auth-errors";
import { safeInternalPath } from "@/lib/landing";

import { AuthForm } from "../_components/auth-form";

export const metadata: Metadata = {
  title: "Crear cuenta",
};

/**
 * `error`: lo que falla en el ida y vuelta con Google vuelve acá como `?error=<código>`.
 * `next`: a dónde volver después de registrarse (S7: la invitación) — se sanea siempre.
 */
type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function RegistroPage({ searchParams }: Props) {
  const { error, next: rawNext } = await searchParams;
  const next = safeInternalPath(rawNext);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-medium text-text">Creá tu cuenta</h1>
        <p className="text-text-secondary">Empezá a ordenar tu semana y tus cobranzas.</p>
      </header>

      <AuthForm
        mode="registro"
        googleEnabled={isGoogleEnabled}
        socialError={toSocialError(error)}
        next={next}
      />

      <p className="text-center text-sm text-text-secondary">
        ¿Ya tenés cuenta?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          Iniciá sesión
        </Link>
      </p>
    </>
  );
}
