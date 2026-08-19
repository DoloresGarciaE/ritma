import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { requireScopedMember } from "@/server/authz";
import { getShellOrganization } from "@/server/organizations";
import { can } from "@/server/services/permissions";
import { listSpaces } from "@/server/services/spaces";

import { AppBar } from "../../_components/app-bar";
import { SalonesManager } from "./_components/salones-manager";

export const metadata: Metadata = {
  title: "Salones",
};

/**
 * Gestión de salones (S8, HU3.1/HU3.4): CRUD mínimo — crear, renombrar, desactivar.
 * Solo STUDIO y solo owner/admin (Plan §4: `spaces:manage`) — un TEACHER ni confirma
 * que la ruta existe (404, §4.3). La autoridad real está en el servicio.
 */
export default async function SalonesPage() {
  const session = await requireSession();
  const org = await getShellOrganization(session.activeOrgId!);

  if (org?.type !== "STUDIO") notFound();

  const { actor } = await requireScopedMember(session.activeOrgId!);
  if (!can(actor, "spaces:manage")) notFound();

  const spaces = await listSpaces(actor);

  return (
    <>
      <AppBar title="Salones" back="/estudio" />
      <SalonesManager spaces={spaces} />
    </>
  );
}
