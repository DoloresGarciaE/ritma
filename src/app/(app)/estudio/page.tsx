import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";

import { requireSession } from "@/lib/auth";
import { getShellOrganization } from "@/server/organizations";

import { AppBar } from "../_components/app-bar";
import { EmptyState } from "../_components/empty-state";

export const metadata: Metadata = {
  title: "Estudio · Ritma",
};

/**
 * Solo para organizaciones de tipo estudio: en una independiente, el owner es el único
 * profe y todo lo del estudio se oculta (Plan §4).
 *
 * Devuelve 404 y no redirige: un redirect confirmaría que la ruta existe (Componentes §4.3).
 */
export default async function EstudioPage() {
  const session = await requireSession();
  const org = await getShellOrganization(session.activeOrgId!);

  if (org?.type !== "STUDIO") notFound();

  return (
    <>
      <AppBar title="Estudio" />

      <EmptyState
        icon={Building2}
        title="Tu estudio, en un solo lugar"
        description="Acá van a estar los salones, los profes y las liquidaciones de fin de mes. Estamos armándolo."
      />
    </>
  );
}
