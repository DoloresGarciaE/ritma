import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { createPayment } from "@/server/services/payments";
import { runGenerateCharges } from "@/server/system/generate-charges";
import { runMarkOverdue } from "@/server/system/mark-overdue";

import { makeCharge, makeEnrollment, makeGroup, makeOrg, makeStudent } from "./factories";

/**
 * Los jobs de sistema (S3), contra Postgres real: la capa que junta los datos cross-org,
 * llama a los servicios puros de billing (ya testeados solos) y persiste. Acá se prueba
 * lo que SOLO la integración puede probar: la idempotencia sobre el unique, que la cuota
 * editada a mano sobrevive a la re-corrida (RN2), y que el período y el "hoy" salen de la
 * zona de CADA org (RN10).
 *
 * Se fakea SOLO `Date` (no los timers): Prisma y el driver pg usan timeouts reales.
 */

async function makeEnrolled(
  orgId: string,
  studentName: string,
  extra: Parameters<typeof makeEnrollment>[3] = {},
) {
  const student = await makeStudent(orgId, studentName);
  const group = await makeGroup(orgId, `Grupo de ${studentName}`);
  return makeEnrollment(orgId, student.id, group.id, extra);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("runGenerateCharges", () => {
  it("genera para TODAS las orgs, cada una con su dueDay y su moneda", async () => {
    const a = await makeOrg("Danzas A");
    const b = await makeOrg("Estudio B");
    await db.organization.update({
      where: { id: b.id },
      data: { dueDay: 1, currency: "UYU" },
    });
    const enrollmentA = await makeEnrolled(a.id, "Sofía", { price: 18000 });
    const enrollmentB = await makeEnrolled(b.id, "Lucía", { price: 25000 });

    const summary = await runGenerateCharges("2026-07");

    expect(summary).toMatchObject({ created: 2, skipped: 0 });

    const chargeA = await db.charge.findUniqueOrThrow({
      where: { enrollmentId_period: { enrollmentId: enrollmentA.id, period: "2026-07" } },
    });
    expect(chargeA.orgId).toBe(a.id);
    expect(chargeA.amount.toNumber()).toBe(18000);
    expect(chargeA.currency).toBe("ARS");
    expect(chargeA.dueDate.toISOString()).toBe("2026-07-10T00:00:00.000Z");
    expect(chargeA.status).toBe("PENDING");

    const chargeB = await db.charge.findUniqueOrThrow({
      where: { enrollmentId_period: { enrollmentId: enrollmentB.id, period: "2026-07" } },
    });
    expect(chargeB.orgId).toBe(b.id);
    expect(chargeB.currency).toBe("UYU");
    expect(chargeB.dueDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("IDEMPOTENTE: re-correr no duplica, y una cuota editada a mano NO se pisa (RN2)", async () => {
    const org = await makeOrg("Danzas Malena");
    const enrollment = await makeEnrolled(org.id, "Sofía", { price: 18000 });

    const first = await runGenerateCharges("2026-07");
    expect(first).toMatchObject({ created: 1, skipped: 0 });

    const charge = await db.charge.findUniqueOrThrow({
      where: { enrollmentId_period: { enrollmentId: enrollment.id, period: "2026-07" } },
    });

    // La profe ajusta la primera cuota (alta a mitad de mes, RN2)…
    await db.charge.update({ where: { id: charge.id }, data: { amount: 9000 } });

    // …y el cron re-corre (retry de Vercel, curl a mano): misma fila, monto intacto.
    const second = await runGenerateCharges("2026-07");
    expect(second).toMatchObject({ created: 0, skipped: 1 });

    const after = await db.charge.findMany({ where: { enrollmentId: enrollment.id } });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(charge.id);
    expect(after[0].amount.toNumber()).toBe(9000);
  });

  it("RN1/RN9 contra la base: DROP_IN, baja previa y alta futura no generan; baja a mitad de mes sí", async () => {
    const org = await makeOrg("Danzas Malena");
    const active = await makeEnrolled(org.id, "Activa", { startDate: "2026-01-05" });
    const midMonthEnd = await makeEnrolled(org.id, "Baja Julio", {
      startDate: "2026-01-05",
      endDate: "2026-07-15",
    });
    await makeEnrolled(org.id, "Baja Junio", { startDate: "2026-01-05", endDate: "2026-06-20" });
    await makeEnrolled(org.id, "Alta Agosto", { startDate: "2026-08-05" });
    await makeEnrolled(org.id, "Clase Suelta", { plan: "DROP_IN" });

    const summary = await runGenerateCharges("2026-07");

    expect(summary).toMatchObject({ created: 2, skipped: 0 });
    const charges = await db.charge.findMany({ where: { orgId: org.id } });
    expect(charges.map((c) => c.enrollmentId).sort()).toEqual([active.id, midMonthEnd.id].sort());
  });

  it("sin período explícito, cada org factura el período de SU hoy (RN10)", async () => {
    // 01:00Z del 1 de agosto: en UTC ya es agosto; en Buenos Aires todavía es 31 de julio.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-01T01:00:00Z"));

    const utcOrg = await makeOrg("Org UTC");
    await db.organization.update({ where: { id: utcOrg.id }, data: { timezone: "UTC" } });
    const arOrg = await makeOrg("Org AR"); // default America/Argentina/Buenos_Aires

    const utcEnrollment = await makeEnrolled(utcOrg.id, "Greta", { startDate: "2026-01-05" });
    const arEnrollment = await makeEnrolled(arOrg.id, "Sofía", { startDate: "2026-01-05" });

    await runGenerateCharges();

    const utcCharge = await db.charge.findFirstOrThrow({
      where: { enrollmentId: utcEnrollment.id },
    });
    const arCharge = await db.charge.findFirstOrThrow({
      where: { enrollmentId: arEnrollment.id },
    });
    expect(utcCharge.period).toBe("2026-08");
    expect(arCharge.period).toBe("2026-07");
  });

  it("un período malformado corta antes de tocar la base", async () => {
    await expect(runGenerateCharges("julio")).rejects.toThrow(/período inválido/);
  });

  it("S4/RN4: tras generar, el saldo a favor cubre las cuotas nuevas — y re-correr no duplica", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));

    const org = await makeOrg("Danzas Malena");
    const student = await makeStudent(org.id, "Valentina Ruiz");
    const group = await makeGroup(org.id, "Árabe inicial");
    await makeEnrollment(org.id, student.id, group.id, { price: 18000, startDate: "2026-06-01" });

    // Pagó por adelantado: $20.000 de crédito puro (todavía no existe ninguna cuota).
    await createPayment(
      org.id,
      { kind: "all" },
      {
        studentId: student.id,
        amount: 20000,
        method: "TRANSFER",
        paidAt: "2026-07-28",
      },
    );

    const first = await runGenerateCharges("2026-08");
    expect(first).toMatchObject({ created: 1, creditsApplied: 1 });

    const charge = await db.charge.findFirstOrThrow({ where: { period: "2026-08" } });
    expect(charge.status).toBe("PAID"); // el crédito la cubrió solo
    const allocations = await db.paymentAllocation.findMany({ where: { chargeId: charge.id } });
    expect(allocations).toHaveLength(1);
    expect(allocations[0].amount.toNumber()).toBe(18000);

    // La idempotencia del cron sigue INTACTA con el crédito adentro (mandato S4).
    const second = await runGenerateCharges("2026-08");
    expect(second).toMatchObject({ created: 0, skipped: 1, creditsApplied: 0 });
    expect(await db.paymentAllocation.count()).toBe(1);
    expect((await db.charge.findUniqueOrThrow({ where: { id: charge.id } })).status).toBe("PAID");
  });
});

describe("runMarkOverdue", () => {
  it("RN3 cross-org: PENDING/PARTIAL vencidas pasan; la que vence HOY, PAID y WAIVED no", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z")); // 09:00 en Buenos Aires

    const a = await makeOrg("Danzas A");
    const b = await makeOrg("Estudio B");
    const enrollmentA = await makeEnrolled(a.id, "Sofía");
    const enrollmentB = await makeEnrolled(b.id, "Lucía");

    const overdueA = await makeCharge(a.id, enrollmentA.id, {
      period: "2026-06",
      dueDate: "2026-06-10",
      status: "PENDING",
    });
    const partialB = await makeCharge(b.id, enrollmentB.id, {
      period: "2026-06",
      dueDate: "2026-07-01",
      status: "PARTIAL",
    });
    const dueToday = await makeCharge(a.id, enrollmentA.id, {
      period: "2026-07",
      dueDate: "2026-07-15",
      status: "PENDING",
    });
    const paid = await makeCharge(b.id, enrollmentB.id, {
      period: "2026-05",
      dueDate: "2026-05-10",
      status: "PAID",
    });
    const waived = await makeCharge(a.id, enrollmentA.id, {
      period: "2026-05",
      dueDate: "2026-05-10",
      status: "WAIVED",
    });

    const summary = await runMarkOverdue();

    expect(summary.marked).toBe(2);

    const status = async (id: string) =>
      (await db.charge.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(overdueA.id)).toBe("OVERDUE");
    expect(await status(partialB.id)).toBe("OVERDUE");
    expect(await status(dueToday.id)).toBe("PENDING");
    expect(await status(paid.id)).toBe("PAID");
    expect(await status(waived.id)).toBe("WAIVED");
  });

  it('el "hoy" es el de la zona de la org: a la 01:00Z del 15, en AR todavía es 14 (RN10)', async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T01:00:00Z"));

    const org = await makeOrg("Danzas Malena"); // AR: hoy es 2026-07-14
    const enrollment = await makeEnrolled(org.id, "Sofía");
    const dueYesterdayUtc = await makeCharge(org.id, enrollment.id, {
      period: "2026-07",
      dueDate: "2026-07-14",
      status: "PENDING",
    });

    const summary = await runMarkOverdue();

    // Para la org es 14 de julio: la cuota vence HOY, todavía no está vencida.
    expect(summary.marked).toBe(0);
    const after = await db.charge.findUniqueOrThrow({ where: { id: dueYesterdayUtc.id } });
    expect(after.status).toBe("PENDING");
  });

  it("re-correrlo al día siguiente no re-marca lo ya OVERDUE (idempotencia diaria)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));

    const org = await makeOrg("Danzas Malena");
    const enrollment = await makeEnrolled(org.id, "Sofía");
    await makeCharge(org.id, enrollment.id, {
      period: "2026-06",
      dueDate: "2026-06-10",
      status: "PENDING",
    });

    expect((await runMarkOverdue()).marked).toBe(1);

    vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
    expect((await runMarkOverdue()).marked).toBe(0);
  });
});
