import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { isGoogleEnabled } from "@/lib/auth";
import { toSocialError } from "@/lib/auth-errors";

import { AuthForm } from "../_components/auth-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

/** Lo que falla en el ida y vuelta con Google vuelve acá como `?error=<código>`. */
type Props = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-medium text-text">Entrá a Ritma</h1>
        <p className="text-text-secondary">Tu agenda, tus alumnos y tus cobranzas.</p>
      </header>

      <AuthForm mode="login" googleEnabled={isGoogleEnabled} socialError={toSocialError(error)} />

      <p className="text-center text-sm text-text-secondary">
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/registro" className={buttonVariants({ variant: "link", size: "sm" })}>
          Creá una
        </Link>
      </p>
    </>
  );
}
