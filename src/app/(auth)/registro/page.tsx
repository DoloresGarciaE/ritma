import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { isGoogleEnabled } from "@/lib/auth";

import { AuthForm } from "../_components/auth-form";

export const metadata: Metadata = {
  title: "Crear cuenta · Ritma",
};

export default function RegistroPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-medium text-text">Creá tu cuenta</h1>
        <p className="text-text-secondary">Empezá a ordenar tu semana y tus cobranzas.</p>
      </header>

      <AuthForm mode="registro" googleEnabled={isGoogleEnabled} />

      <p className="text-center text-sm text-text-secondary">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className={buttonVariants({ variant: "link", size: "sm" })}>
          Iniciá sesión
        </Link>
      </p>
    </>
  );
}
