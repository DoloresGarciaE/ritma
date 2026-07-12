import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

import { LogoutButton } from "../_components/logout-button";

export const metadata: Metadata = {
  title: "Inicio · Ritma",
};

export default async function DashboardPage() {
  const session = await requireSession();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="font-display text-2xl font-medium text-text">Hola, {session.name}</h1>
          <p className="text-sm text-text-secondary">{session.email}</p>
        </div>
        <LogoutButton />
      </header>

      {session.activeOrgId ? (
        <Card className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Organización activa</span>
          <span className="font-medium text-text">{session.activeOrgId}</span>
          <p className="text-sm text-text-secondary">
            El dashboard de verdad llega en el próximo bloque.
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Building2 aria-hidden className="size-12 text-text-muted" strokeWidth={1.75} />
          <h2 className="font-display text-xl font-medium text-text">
            Todavía no tenés una organización
          </h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Es el espacio donde van a vivir tu agenda, tus alumnos y tus cobranzas. Vas a poder
            crearla en el próximo paso.
          </p>
        </Card>
      )}
    </div>
  );
}
