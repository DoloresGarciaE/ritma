import { randomUUID } from "node:crypto";

import type { OrgType, Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { normalizeForSearch } from "@/lib/students";

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

/** Un grupo en una org, por el camino crudo. Crea su propia disciplina si no le dan una. */
export async function makeGroup(
  orgId: string,
  name: string,
  extra: { disciplineId?: string; defaultPrice?: number; active?: boolean } = {},
) {
  const disciplineId =
    extra.disciplineId ?? (await makeDiscipline(orgId, `Disciplina ${randomUUID()}`)).id;

  return db.classGroup.create({
    data: {
      orgId,
      disciplineId,
      name,
      defaultPrice: extra.defaultPrice ?? 20000,
      active: extra.active ?? true,
    },
  });
}

/** Una franja de un grupo, por el camino crudo. Default: martes 19:00, 60 minutos. */
export async function makeSlot(
  orgId: string,
  groupId: string,
  extra: { weekday?: number; startTime?: string; durationMin?: number } = {},
) {
  return db.scheduleSlot.create({
    data: {
      orgId,
      groupId,
      weekday: extra.weekday ?? 2,
      startTime: extra.startTime ?? "19:00",
      durationMin: extra.durationMin ?? 60,
    },
  });
}

/** Una excepción de sesión, por el camino crudo. `date` es la fecha civil "yyyy-MM-dd". */
export async function makeSession(
  orgId: string,
  groupId: string,
  slotId: string,
  date: string,
  extra: {
    status?: "SCHEDULED" | "CANCELLED" | "DONE";
    note?: string | null;
    movedToDate?: string | null;
    movedToStartTime?: string | null;
  } = {},
) {
  return db.classSession.create({
    data: {
      orgId,
      groupId,
      slotId,
      date: new Date(`${date}T00:00:00.000Z`),
      status: extra.status ?? "CANCELLED",
      note: extra.note ?? null,
      movedToDate: extra.movedToDate ? new Date(`${extra.movedToDate}T00:00:00.000Z`) : null,
      movedToStartTime: extra.movedToStartTime ?? null,
    },
  });
}

/** Un alumno en una org, por el camino crudo. `searchName` se calcula igual que el servicio. */
export async function makeStudent(
  orgId: string,
  name: string,
  extra: { phone?: string | null; active?: boolean } = {},
) {
  return db.student.create({
    data: {
      orgId,
      name,
      searchName: normalizeForSearch(name),
      phone: extra.phone ?? null,
      active: extra.active ?? true,
    },
  });
}
