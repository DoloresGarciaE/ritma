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

/** Una inscripción, por el camino crudo. Default: mensual, $18.000, alta 2026-07-01. */
export async function makeEnrollment(
  orgId: string,
  studentId: string,
  groupId: string,
  extra: {
    plan?: "MONTHLY" | "DROP_IN";
    price?: number;
    startDate?: string;
    endDate?: string | null;
  } = {},
) {
  return db.enrollment.create({
    data: {
      orgId,
      studentId,
      groupId,
      plan: extra.plan ?? "MONTHLY",
      price: extra.price ?? 18000,
      startDate: new Date(`${extra.startDate ?? "2026-07-01"}T00:00:00.000Z`),
      endDate: extra.endDate ? new Date(`${extra.endDate}T00:00:00.000Z`) : null,
    },
  });
}

/** Una cuota, por el camino crudo. Default: período 2026-07, $18.000 ARS, vence el 10. */
export async function makeCharge(
  orgId: string,
  enrollmentId: string,
  extra: {
    period?: string;
    amount?: number;
    currency?: string;
    dueDate?: string;
    status?: "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "WAIVED";
  } = {},
) {
  const period = extra.period ?? "2026-07";

  return db.charge.create({
    data: {
      orgId,
      enrollmentId,
      period,
      amount: extra.amount ?? 18000,
      currency: extra.currency ?? "ARS",
      dueDate: new Date(`${extra.dueDate ?? `${period}-10`}T00:00:00.000Z`),
      status: extra.status ?? "PENDING",
    },
  });
}

/** Un pago, por el camino crudo. Default: $18.000 ARS en efectivo, pagado 2026-07-05. */
export async function makePayment(
  orgId: string,
  studentId: string,
  extra: {
    amount?: number;
    currency?: string;
    method?: "CASH" | "TRANSFER" | "OTHER";
    receivedBy?: "STUDIO" | "TEACHER";
    paidAt?: string;
    attachmentKey?: string | null;
  } = {},
) {
  return db.payment.create({
    data: {
      orgId,
      studentId,
      amount: extra.amount ?? 18000,
      currency: extra.currency ?? "ARS",
      method: extra.method ?? "CASH",
      receivedBy: extra.receivedBy ?? "STUDIO",
      paidAt: new Date(`${extra.paidAt ?? "2026-07-05"}T00:00:00.000Z`),
      attachmentKey: extra.attachmentKey ?? null,
      receiptToken: randomUUID(),
    },
  });
}

/** Una imputación pago→cuota, por el camino crudo. */
export async function makeAllocation(
  orgId: string,
  paymentId: string,
  chargeId: string,
  amount = 18000,
) {
  return db.paymentAllocation.create({
    data: { orgId, paymentId, chargeId, amount },
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

/** Un recordatorio enviado, por el camino crudo. */
export async function makeReminderLog(
  orgId: string,
  studentId: string,
  extra: { channel?: "WHATSAPP_LINK" | "EMAIL"; chargeId?: string; sentAt?: Date } = {},
) {
  return db.reminderLog.create({
    data: {
      orgId,
      studentId,
      chargeId: extra.chargeId ?? null,
      channel: extra.channel ?? "WHATSAPP_LINK",
      sentAt: extra.sentAt ?? new Date("2026-07-10T15:00:00.000Z"),
    },
  });
}
