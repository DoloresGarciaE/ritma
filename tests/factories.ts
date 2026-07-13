import { randomUUID } from "node:crypto";

import type { OrgType, Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Fábricas para los tests de aislamiento. Usan el `db` CRUDO a propósito: arman datos
 * cross-org (dos organizaciones, sus usuarios y membresías) que ninguna sola llamada a
 * `withOrg` podría montar. El scoping se verifica DESPUÉS, desde afuera, con withOrg.
 */

export async function makeUser(name = "Test User") {
  return db.user.create({
    data: { email: `${randomUUID()}@test.local`, name },
  });
}

export async function makeOrg(name: string, type: OrgType = "STUDIO") {
  return db.organization.create({ data: { name, type } });
}

/** Un actor testeable: usuario nuevo + membresía en `orgId`. No crea credencial: no hay login que probar. */
export async function makeMember(orgId: string, role: Role = "TEACHER") {
  const user = await makeUser(`Test ${role}`);
  await db.membership.create({ data: { userId: user.id, orgId, role } });
  return { userId: user.id, orgId, role } as const;
}

/** Una disciplina en una org, por el camino crudo (setup, no lo que se testea). */
export async function makeDiscipline(orgId: string, name: string) {
  return db.discipline.create({ data: { orgId, name } });
}
