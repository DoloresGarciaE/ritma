import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getDisciplines, getShellOrganization } from "@/server/organizations";

import { AppBar } from "../_components/app-bar";

export const metadata: Metadata = {
  title: "Ajustes · Ritma",
};

/**
 * Placeholder de solo lectura: muestra la configuración con la que quedó la organización
 * (los defaults de HU1.2). Editarla es de un bloque posterior.
 */
export default async function AjustesPage() {
  const session = await requireSession();
  const orgId = session.activeOrgId!;

  const [org, disciplines] = await Promise.all([
    getShellOrganization(orgId),
    getDisciplines(orgId),
  ]);

  return (
    <>
      <AppBar title="Ajustes" back="/mas" />

      <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-text">{org?.name}</h2>
          <dl className="flex flex-col gap-2 text-sm">
            {[
              ["Tipo", org?.type === "STUDIO" ? "Estudio" : "Trabajo por mi cuenta"],
              ["Moneda", "ARS"],
              ["Vencimiento de las cuotas", "Día 10 de cada mes"],
              ["Zona horaria", "Buenos Aires"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="text-text-secondary">{label}</dt>
                <dd className="text-right text-text">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-text">Disciplinas</h2>
          <ul className="flex flex-wrap gap-2">
            {disciplines.map((discipline) => (
              <li
                key={discipline.id}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-text-secondary"
              >
                {discipline.name}
              </li>
            ))}
          </ul>
        </Card>

        <p className="text-xs text-text-secondary">
          Por ahora es solo lectura. Vas a poder editar todo esto más adelante.
        </p>
      </div>
    </>
  );
}
