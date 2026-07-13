import "server-only";

import type { Role } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth";
import { withOrg } from "@/lib/db";

import { assertRole, ForbiddenError, type Actor } from "./services/permissions";

/**
 * La capa de autorización: convierte la sesión (identidad) en un `Actor` (identidad +
 * rol dentro de una organización), revalidando la membresía contra la base.
 *
 * `activeOrgId` viaja en la sesión como CONTEXTO, no como permiso: que la sesión traiga
 * un `orgId` no prueba que el usuario siga siendo miembro (lo pudieron sacar de la org).
 * Por eso el `orgId` se recibe explícito y la membresía se revalida siempre acá — nunca
 * en la UI, que no es la única guardiana (Plan §10, decisión 7; Componentes §4.3).
 */

/**
 * El actor si es miembro de `orgId`; si no, lanza `ForbiddenError`. La lectura de
 * `Membership` pasa por `withOrg` (mismo aislamiento que todo lo demás): el `where`
 * ya trae el `orgId` inyectado, y el `userId` explícito completa la clave.
 */
export async function requireMember(orgId: string): Promise<Actor> {
  const session = await requireSession();

  const membership = await withOrg(orgId).membership.findUnique({
    where: { userId_orgId: { userId: session.userId, orgId } },
    select: { role: true },
  });

  if (!membership) {
    throw new ForbiddenError("No sos miembro de esta organización.");
  }

  return { userId: session.userId, orgId, role: membership.role };
}

/**
 * El actor si es miembro de `orgId` Y tiene uno de los roles pedidos; si no,
 * `ForbiddenError`. Para las mutaciones que la matriz reserva a owner/admin.
 */
export async function requireRole(orgId: string, ...roles: Role[]): Promise<Actor> {
  const actor = await requireMember(orgId);
  assertRole(actor, roles);
  return actor;
}
