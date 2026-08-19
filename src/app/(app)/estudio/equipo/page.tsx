import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { civilDateOf, DEFAULT_TIMEZONE } from "@/lib/dates";
import { isEmailConfigured } from "@/lib/email";
import { formatListDate } from "@/lib/format";
import { requireScopedMember } from "@/server/authz";
import { getOrgSettings, getShellOrganization } from "@/server/organizations";
import { can } from "@/server/services/permissions";
import { listPendingInvitations, listTeam } from "@/server/services/team";

import { AppBar } from "../../_components/app-bar";
import { InvitationsSection } from "./_components/invitations-section";
import { InviteTeam } from "./_components/invite-team";
import { TeamSection } from "./_components/team-section";

export const metadata: Metadata = {
  title: "Equipo",
};

/**
 * Gestión del equipo (S7, HU1.3): miembros con su rol y su perfil, invitaciones
 * pendientes, y el alta por link (con email opcional). Solo STUDIO y solo owner/admin —
 * un TEACHER ni siquiera confirma que la ruta existe (404, §4.3). La autoridad real
 * está en el servicio (`members:manage`); esto solo decide qué se muestra.
 */
export default async function EquipoPage() {
  const session = await requireSession();
  const org = await getShellOrganization(session.activeOrgId!);

  if (org?.type !== "STUDIO") notFound();

  const { actor } = await requireScopedMember(session.activeOrgId!);
  if (!can(actor, "members:manage")) notFound();

  const [team, pending, settings] = await Promise.all([
    listTeam(actor),
    listPendingInvitations(actor),
    getOrgSettings(actor.orgId),
  ]);

  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;
  const invitations = pending.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expired: invitation.expired,
    /** Ya formateado acá: el instante se vuelve fecha civil de la org (RN10). */
    expiresLabel: formatListDate(civilDateOf(new Date(invitation.expiresAt), timezone)),
  }));

  return (
    <>
      <AppBar
        title="Equipo"
        back="/estudio"
        action={<InviteTeam emailEnabled={isEmailConfigured()} />}
      />

      <div className="flex flex-col gap-6 px-4 py-6 md:px-6">
        <TeamSection members={team} selfUserId={actor.userId} />
        <InvitationsSection invitations={invitations} />
      </div>
    </>
  );
}
