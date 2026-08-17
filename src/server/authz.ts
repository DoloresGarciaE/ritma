import "server-only";

import { cache } from "react";

import type { Role } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth";
import { withOrg } from "@/lib/db";

import {
  assertRole,
  ForbiddenError,
  scopeOf,
  type Actor,
  type DataScope,
} from "./services/permissions";

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
 *
 * Con `cache()` de React (S7): el layout y la página del mismo request pagan UNA
 * query, no dos. Por request, así que no puede servir una membresía vieja.
 */
export const requireMember = cache(async (orgId: string): Promise<Actor> => {
  const session = await requireSession();

  const membership = await withOrg(orgId).membership.findUnique({
    where: { userId_orgId: { userId: session.userId, orgId } },
    select: { role: true },
  });

  if (!membership) {
    throw new ForbiddenError("No sos miembro de esta organización.");
  }

  return { userId: session.userId, orgId, role: membership.role };
});

/**
 * El actor si es miembro de `orgId` Y tiene uno de los roles pedidos; si no,
 * `ForbiddenError`. Para las mutaciones que la matriz reserva a owner/admin.
 */
export async function requireRole(orgId: string, ...roles: Role[]): Promise<Actor> {
  const actor = await requireMember(orgId);
  assertRole(actor, roles);
  return actor;
}

/**
 * El actor MÁS su alcance de datos (S7): el punto de extensión que F0.6 dejó
 * definido (`scopeOf`), resuelto contra la base. Owner/admin → `all`; TEACHER →
 * el id de su `TeacherProfile` (o `null` si no tiene: scope VACÍO, jamás todo —
 * los armadores de `where` de permissions.ts fail-closed sobre eso).
 *
 * Todo accesor de lectura y toda mutación con alcance reciben este `scope`
 * explícito: la pantalla solo esconde (§4.3), la autoridad es esta capa.
 */
export const requireScopedMember = cache(
  async (orgId: string): Promise<{ actor: Actor; scope: DataScope }> => {
    const actor = await requireMember(orgId);
    const identityScope = scopeOf(actor);

    if (identityScope.kind === "all") {
      return { actor, scope: { kind: "all" } };
    }

    const profile = await withOrg(orgId).teacherProfile.findFirst({
      where: { membershipUserId: identityScope.teacherUserId },
      select: { id: true },
    });

    return { actor, scope: { kind: "teacher", teacherProfileId: profile?.id ?? null } };
  },
);
