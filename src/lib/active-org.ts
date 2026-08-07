import { db } from "@/lib/db";
import type { OrgType, Role } from "@/generated/prisma/client";

/**
 * Organización activa con preferencia del usuario (adelanto mínimo de S7).
 *
 * `activeOrgId` siempre fue "la primera membresía"; con usuarios multi-org (dueña de un
 * estudio + profe en otro) hace falta poder elegir. La preferencia viaja en una COOKIE
 * propia — no en la base (cero migraciones) ni en la sesión de Better Auth (identidad y
 * sesión, nada más): `customSession` la lee en cada request y la valida contra las
 * membresías REALES. Una cookie apuntando a una org ajena simplemente se ignora.
 *
 * Esto sigue siendo CONTEXTO, no autorización: `withOrg` y `requireMember` revalidan
 * todo igual (F0.6).
 */

export const ACTIVE_ORG_COOKIE = "ritma-active-org";

/**
 * Resuelve la org activa: la preferida SOLO si hay membresía que la respalde; si no,
 * la primera membresía (el comportamiento de siempre); sin membresías, null (recién
 * registrado). Pura: la seguridad de esta función se prueba sin base.
 */
export function resolveActiveOrg(
  membershipOrgIds: readonly string[],
  preferredOrgId: string | null | undefined,
): string | null {
  if (preferredOrgId && membershipOrgIds.includes(preferredOrgId)) return preferredOrgId;
  return membershipOrgIds[0] ?? null;
}

export type UserMembership = {
  orgId: string;
  role: Role;
  orgName: string;
  orgType: OrgType;
};

/**
 * Las membresías de UN usuario, cross-org por naturaleza (es dato de identidad, como el
 * arranque de sesión en auth.ts — por eso vive en lib/ con el cliente crudo). El orden
 * por antigüedad es el mismo que usa la sesión para "la primera".
 */
export async function listMembershipsForUser(userId: string): Promise<UserMembership[]> {
  const memberships = await db.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { orgId: true, role: true, org: { select: { name: true, type: true } } },
  });

  return memberships.map((membership) => ({
    orgId: membership.orgId,
    role: membership.role,
    orgName: membership.org.name,
    orgType: membership.org.type,
  }));
}
