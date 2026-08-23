import { withOrg, type OrgClient } from "@/lib/db";
import { generateInvitationToken, INVITATION_TTL_DAYS } from "@/lib/invitations";

import { assertRole, can, type Actor } from "./permissions";

/**
 * Gestión del equipo (S7, HU1.3): miembros, invitaciones y revocación de acceso.
 *
 * A diferencia del resto de los servicios, estas funciones reciben el `Actor` — no un
 * `orgId` pelado — porque la matriz del Plan §4 las reserva a owner/admin
 * (`members:manage`) y la autoridad vive ACÁ, no en la pantalla ni solo en la action:
 * "teacher no invita ni revoca" tiene que ser cierto por API, no por UI (§4.3).
 *
 * Revocar acceso ≠ borrar historia (HU1.3): se elimina la Membership (el selector deja
 * de ofrecer la org y la sesión activa muere en el próximo request — el resolver
 * revalida siempre) y el TeacherProfile queda con `membershipUserId` en null, con sus
 * grupos y todo su historial intactos, re-vinculable si la persona vuelve.
 */

export type TeamRole = "ADMIN" | "TEACHER";

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "TEACHER";
  /** Perfil docente vinculado, si dicta clases. `kind` decide si lleva acuerdo (S9). */
  teacher: {
    id: string;
    displayName: string;
    groupCount: number;
    kind: "OWNER_TEACHER" | "STAFF" | "EXTERNAL";
  } | null;
};

export type PendingInvitation = {
  id: string;
  email: string | null;
  role: TeamRole;
  /** Instante ISO; la UI lo muestra como fecha civil de la org. */
  expiresAt: string;
  expired: boolean;
};

/**
 * Regla que la UI puede provocar legítimamente (link viejo, doble tap): viaja como
 * error de formulario. Las referencias forjadas siguen cortando con throw genérico.
 */
export class TeamRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamRuleError";
  }
}

/** La gestión del equipo existe SOLO en un estudio (alcance S7). */
async function assertStudio(org: OrgClient, orgId: string): Promise<void> {
  const organization = await org.organization.findUnique({
    where: { id: orgId },
    select: { type: true },
  });
  if (organization?.type !== "STUDIO") {
    throw new Error("La gestión del equipo existe solo en un estudio.");
  }
}

function assertCanManageMembers(actor: Actor): void {
  // `can` y `assertRole` cuentan lo mismo hoy; el assert da el error con mensaje.
  if (!can(actor, "members:manage")) assertRole(actor, ["OWNER", "ADMIN"]);
}

/** El equipo completo: miembros con su rol y su perfil docente (si dictan). */
export async function listTeam(actor: Actor): Promise<TeamMember[]> {
  assertCanManageMembers(actor);
  const org = withOrg(actor.orgId);
  await assertStudio(org, actor.orgId);

  const [memberships, profiles] = await Promise.all([
    org.membership.findMany({
      orderBy: { createdAt: "asc" },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    }),
    org.teacherProfile.findMany({
      where: { membershipUserId: { not: null } },
      select: {
        id: true,
        displayName: true,
        membershipUserId: true,
        kind: true,
        _count: { select: { groups: { where: { active: true } } } },
      },
    }),
  ]);

  const profileByUser = new Map(profiles.map((profile) => [profile.membershipUserId, profile]));

  return memberships.map((membership) => {
    const profile = profileByUser.get(membership.userId);
    return {
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      teacher: profile
        ? {
            id: profile.id,
            displayName: profile.displayName,
            groupCount: profile._count.groups,
            kind: profile.kind,
          }
        : null,
    };
  });
}

/**
 * Crea la invitación: rol ADMIN o TEACHER (OWNER no se invita: nace con la org) y
 * email opcional — el link copiable existe SIEMPRE; el email es solo un canal más.
 */
export async function createInvitation(
  actor: Actor,
  input: { role: TeamRole; email?: string | null },
): Promise<{ id: string; token: string }> {
  assertCanManageMembers(actor);
  const org = withOrg(actor.orgId);
  await assertStudio(org, actor.orgId);

  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  return org.invitation.create({
    data: {
      orgId: actor.orgId,
      role: input.role,
      email: input.email?.trim() || null,
      token: generateInvitationToken(),
      expiresAt,
    },
    select: { id: true, token: true },
  });
}

/** Las invitaciones sin usar (vigentes y vencidas — la vencida se regenera o revoca). */
export async function listPendingInvitations(actor: Actor): Promise<PendingInvitation[]> {
  assertCanManageMembers(actor);
  const org = withOrg(actor.orgId);
  await assertStudio(org, actor.orgId);

  const rows = await org.invitation.findMany({
    where: { usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true },
  });

  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    // El schema usa el enum Role completo; OWNER es inalcanzable (lo corta el create).
    role: row.role as TeamRole,
    expiresAt: row.expiresAt.toISOString(),
    expired: row.expiresAt.getTime() < now,
  }));
}

/**
 * El token de UNA invitación, para copiar el link. Igual que el comprobante: el token
 * viaja al cliente solo al compartir, nunca en el payload de la lista.
 */
export async function getInvitationToken(
  actor: Actor,
  invitationId: string,
): Promise<{ token: string } | null> {
  assertCanManageMembers(actor);

  return withOrg(actor.orgId).invitation.findFirst({
    where: { id: invitationId, usedAt: null },
    select: { token: true },
  });
}

/** Rotar el token y correr el vencimiento: el link viejo muere en el acto. */
export async function regenerateInvitation(
  actor: Actor,
  invitationId: string,
): Promise<{ token: string }> {
  assertCanManageMembers(actor);
  const org = withOrg(actor.orgId);

  const updated = await org.invitation.updateMany({
    where: { id: invitationId, usedAt: null },
    data: {
      token: generateInvitationToken(),
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  if (updated.count === 0) {
    throw new TeamRuleError("Esa invitación ya no existe o ya fue usada.");
  }

  const row = await org.invitation.findFirst({
    where: { id: invitationId },
    select: { token: true },
  });
  if (!row) throw new TeamRuleError("Esa invitación ya no existe o ya fue usada.");
  return row;
}

/**
 * Revocar una invitación = BORRAR la fila: no hay estado "revocada" — un token que no
 * está en la base no autoriza nada (mismo principio que rotar un comprobante). Solo
 * las sin usar: la aceptada es historia del equipo.
 */
export async function revokeInvitation(actor: Actor, invitationId: string): Promise<void> {
  assertCanManageMembers(actor);

  const deleted = await withOrg(actor.orgId).invitation.deleteMany({
    where: { id: invitationId, usedAt: null },
  });
  if (deleted.count === 0) {
    throw new TeamRuleError("Esa invitación ya no existe o ya fue usada.");
  }
}

/**
 * Revocar el ACCESO de un miembro (HU1.3): borra la Membership y desvincula su perfil
 * docente en la misma transacción. El perfil, sus grupos y su historial quedan
 * intactos (`membershipUserId = null`). Al OWNER no se lo revoca (la org es suya), y
 * nadie se revoca a sí mismo (un admin sin acceso por su propio tap sería un misterio).
 */
export async function revokeMemberAccess(actor: Actor, targetUserId: string): Promise<void> {
  assertCanManageMembers(actor);
  const org = withOrg(actor.orgId);
  await assertStudio(org, actor.orgId);

  if (targetUserId === actor.userId) {
    throw new TeamRuleError("No podés revocar tu propio acceso.");
  }

  const membership = await org.membership.findUnique({
    where: { userId_orgId: { userId: targetUserId, orgId: actor.orgId } },
    select: { role: true },
  });
  if (!membership) {
    throw new TeamRuleError("Esa persona ya no es parte del equipo.");
  }
  if (membership.role === "OWNER") {
    throw new TeamRuleError("La titular de la organización no se puede revocar.");
  }

  await org.$transaction(async (tx) => {
    const scoped = tx as unknown as OrgClient;
    await scoped.membership.delete({
      where: { userId_orgId: { userId: targetUserId, orgId: actor.orgId } },
    });
    await scoped.teacherProfile.updateMany({
      where: { membershipUserId: targetUserId },
      data: { membershipUserId: null },
    });
  });
}

/**
 * Acepta una invitación por token (S7, decisión 2): exige sesión (el caller la trae) y
 * crea Membership + TeacherProfile (si el rol es TEACHER) en UNA transacción, marcando
 * la invitación como usada. Un solo uso REAL: el `updateMany` condicionado sobre
 * `usedAt: null` gana la carrera de dos aceptaciones simultáneas — la que pierde no
 * escribe nada.
 *
 * El `orgId` sale de la puerta pública por token (server/public/invitations.ts), no
 * del cliente; el token se revalida acá adentro vía `withOrg` — un token de otra org
 * simplemente no existe en esta (el unique global no ayuda a cruzar: el where lleva el
 * orgId inyectado).
 *
 * Si la persona vuelve tras una revocación, se crea un perfil NUEVO: el viejo quedó
 * desvinculado y re-vincularlo es una decisión de admin (S9), no magia por nombre.
 */
export async function acceptInvitation(
  user: { id: string; name: string },
  orgId: string,
  token: string,
): Promise<{ orgId: string }> {
  const org = withOrg(orgId);

  await org.$transaction(async (tx) => {
    const scoped = tx as unknown as OrgClient;

    const invitation = await scoped.invitation.findUnique({
      where: { token },
      select: { id: true, role: true, expiresAt: true, usedAt: true },
    });
    if (!invitation) {
      throw new TeamRuleError("Esta invitación no existe o fue revocada.");
    }
    if (invitation.usedAt) {
      throw new TeamRuleError("Esta invitación ya fue usada.");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new TeamRuleError("Esta invitación venció. Pedí una nueva.");
    }
    if (invitation.role === "OWNER") {
      // Inalcanzable (el create no lo permite), pero un estado imposible se corta, no
      // se interpreta.
      throw new Error("Una invitación no puede otorgar OWNER.");
    }

    const existing = await scoped.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId } },
      select: { userId: true },
    });
    if (existing) {
      throw new TeamRuleError("Ya sos parte de esta organización.");
    }

    const used = await scoped.invitation.updateMany({
      where: { id: invitation.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) {
      throw new TeamRuleError("Esta invitación ya fue usada.");
    }

    await scoped.membership.create({
      data: { userId: user.id, orgId, role: invitation.role },
    });

    if (invitation.role === "TEACHER") {
      await scoped.teacherProfile.create({
        data: {
          orgId,
          membershipUserId: user.id,
          displayName: user.name,
          kind: "STAFF",
        },
      });
    }
  });

  return { orgId };
}
