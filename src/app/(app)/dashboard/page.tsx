import type { Metadata } from "next";
import { CalendarPlus } from "lucide-react";

import { requireSession } from "@/lib/auth";
import { getShellOrganization } from "@/server/organizations";

import { AppBar } from "../_components/app-bar";
import { EmptyState } from "../_components/empty-state";

export const metadata: Metadata = {
  title: "Inicio · Ritma",
};

export default async function DashboardPage() {
  const session = await requireSession();
  // El layout ya garantizó que hay organización.
  const org = await getShellOrganization(session.activeOrgId!);

  return (
    <>
      <AppBar title={org?.name ?? "Inicio"} />

      <EmptyState
        icon={CalendarPlus}
        title="Empecemos por tu primer grupo"
        description="Un grupo es una clase con su horario, su disciplina y sus alumnos. Con eso armado, la agenda y las cuotas salen solas."
        cta={{ label: "Creá tu primer grupo", href: "/agenda" }}
      />
    </>
  );
}
