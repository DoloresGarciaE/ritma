import { describe, expect, it } from "vitest";

import { addMonths, periodOf, todayInTz, DEFAULT_TIMEZONE } from "@/lib/dates";
import { db } from "@/lib/db";
import { AgreementRuleError, listAgreements, setAgreement } from "@/server/services/agreements";
import {
  applyStudentCredit,
  createPayment,
  deletePayment,
  PaymentRuleError,
} from "@/server/services/payments";
import { ForbiddenError, type Actor, type DataScope } from "@/server/services/permissions";
import {
  closeSettlement,
  markSettlementPaid,
  SettlementRuleError,
  settlementDetail,
  settlementOverview,
  teacherSettlements,
} from "@/server/services/settlements";

import {
  makeAgreement,
  makeAllocation,
  makeCharge,
  makeEnrollment,
  makeGroup,
  makeMember,
  makeOrg,
  makePayment,
  makeStudent,
  makeTeacherProfile,
} from "./factories";

/**
 * S9, la mitad con base de la suite insignia: quién entra a B y C desde imputaciones
 * REALES, el ciclo cerrar→PAID, el congelado (RN12 completa), la imputación tardía
 * (RN6-bis) y los baldes que se cantan. La fórmula pura vive en
 * src/server/services/settlements.test.ts.
 */

const ALL: DataScope = { kind: "all" };
const today = todayInTz(DEFAULT_TIMEZONE);
const CUR = periodOf(today);
const PREV = addMonths(CUR, -1);
const TWO_AGO = addMonths(CUR, -2);

async function actorIn(orgId: string, role: "OWNER" | "ADMIN" | "TEACHER"): Promise<Actor> {
  const member = await makeMember(orgId, role);
  return { userId: member.userId, orgId, role };
}

/** Un estudio con una profe STAFF (30% desde enero), su grupo, una alumna inscripta. */
async function makeStudio() {
  const org = await makeOrg("Estudio Compás");
  const admin = await actorIn(org.id, "ADMIN");
  const profile = await makeTeacherProfile(org.id, "Caro Suárez");
  await makeAgreement(org.id, profile.id, { studioPercent: 30, validFrom: "2026-01-01" });
  const group = await makeGroup(org.id, "Árabe inicial", { teacherId: profile.id });
  const student = await makeStudent(org.id, "Alumna Uno");
  const enrollment = await makeEnrollment(org.id, student.id, group.id);
  return { org, admin, profile, group, student, enrollment };
}

describe("settlementOverview — B y C desde imputaciones reales", () => {
  it("un pago imputado al profe arma B; el ejemplo cuadra a mano", async () => {
    const { org, admin, enrollment, student } = await makeStudio();
    const charge = await makeCharge(org.id, enrollment.id, { period: PREV, amount: 18000 });
    await createPayment(org.id, ALL, {
      studentId: student.id,
      amount: 18000,
      method: "CASH",
      paidAt: `${PREV}-15`,
      allocations: [{ chargeId: charge.id, amount: 18000 }],
    });

    const overview = await settlementOverview(admin, PREV);
    expect(overview.teachers).toHaveLength(1);
    expect(overview.teachers[0]).toMatchObject({
      displayName: "Caro Suárez",
      state: "draft",
      numbers: {
        gross: 18000,
        studioShare: 5400, // 30%
        collectedByTeacher: 0,
        netToTeacher: 12600,
      },
    });
  });

  it("un pago multi-cuota entre DOS profes: la imputación decide de quién es cada peso", async () => {
    const { org, admin, profile, enrollment, student } = await makeStudio();
    const other = await makeTeacherProfile(org.id, "Otra Profe");
    await makeAgreement(org.id, other.id, { studioPercent: 50 });
    const otherGroup = await makeGroup(org.id, "Canto", { teacherId: other.id });
    const otherEnrollment = await makeEnrollment(org.id, student.id, otherGroup.id);

    const chargeA = await makeCharge(org.id, enrollment.id, { period: PREV, amount: 10000 });
    const chargeB = await makeCharge(org.id, otherEnrollment.id, { period: PREV, amount: 20000 });
    await createPayment(org.id, ALL, {
      studentId: student.id,
      amount: 30000,
      method: "TRANSFER",
      paidAt: `${PREV}-10`,
      allocations: [
        { chargeId: chargeA.id, amount: 10000 },
        { chargeId: chargeB.id, amount: 20000 },
      ],
    });

    const overview = await settlementOverview(admin, PREV);
    const caro = overview.teachers.find((t) => t.teacherId === profile.id);
    const otra = overview.teachers.find((t) => t.teacherId === other.id);
    expect(caro?.numbers).toMatchObject({ gross: 10000, studioShare: 3000 });
    expect(otra?.numbers).toMatchObject({ gross: 20000, studioShare: 10000 });
  });

  it("C toma el pago COMPLETO cobrado en mano (receivedById), imputado o no", async () => {
    const { org, admin, profile, enrollment, student } = await makeStudio();
    const charge = await makeCharge(org.id, enrollment.id, { period: PREV, amount: 17000 });
    // Cobró en mano $20.000: $17.000 a su cuota, $3.000 quedan a favor de la alumna.
    await createPayment(org.id, ALL, {
      studentId: student.id,
      amount: 20000,
      method: "CASH",
      receivedBy: "TEACHER",
      receivedById: profile.id,
      paidAt: `${PREV}-12`,
      allocations: [{ chargeId: charge.id, amount: 17000 }],
    });

    const overview = await settlementOverview(admin, PREV);
    expect(overview.teachers[0].numbers).toMatchObject({
      gross: 17000,
      studioShare: 5100,
      collectedByTeacher: 20000,
      netToTeacher: -8100, // negativo: le debe al estudio (signo explícito en la UI)
    });
  });

  it("sin acuerdo no se inventa nada: la fila pide el acuerdo (needs-agreement)", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");
    const profile = await makeTeacherProfile(org.id, "Sin Acuerdo");
    const group = await makeGroup(org.id, "Canto", { teacherId: profile.id });
    const student = await makeStudent(org.id, "Alumna");
    const enrollment = await makeEnrollment(org.id, student.id, group.id);
    const charge = await makeCharge(org.id, enrollment.id, { period: PREV });
    const payment = await makePayment(org.id, student.id, { paidAt: `${PREV}-10` });
    await makeAllocation(org.id, payment.id, charge.id, 18000);

    const overview = await settlementOverview(admin, PREV);
    expect(overview.teachers[0].state).toBe("needs-agreement");
    expect(overview.teachers[0].numbers).toBeNull();
    expect(overview.teachers[0].agreementIssue).toContain("acuerdo");
  });

  it("los baldes se CANTAN: grupo sin profe y cobro en mano sin atribuir", async () => {
    const { org, admin, student } = await makeStudio();
    const orphanGroup = await makeGroup(org.id, "Sin Profe");
    const orphanEnrollment = await makeEnrollment(org.id, student.id, orphanGroup.id);
    const orphanCharge = await makeCharge(org.id, orphanEnrollment.id, {
      period: PREV,
      amount: 7000,
    });
    const orphanPayment = await makePayment(org.id, student.id, {
      amount: 7000,
      paidAt: `${PREV}-08`,
    });
    await makeAllocation(org.id, orphanPayment.id, orphanCharge.id, 7000);
    // El caso RN5 viejo de S4: en mano, sin receivedById.
    await makePayment(org.id, student.id, {
      amount: 4000,
      receivedBy: "TEACHER",
      paidAt: `${PREV}-09`,
    });

    const overview = await settlementOverview(admin, PREV);
    expect(overview.unassigned).toEqual({ total: 7000, count: 1 });
    expect(overview.unattributed).toEqual({ total: 4000, count: 1 });
    // Y en NINGÚN profe: la de Caro queda en cero.
    expect(overview.teachers[0].numbers).toMatchObject({ gross: 0, collectedByTeacher: 0 });
  });

  it("la titular (OWNER_TEACHER) no se liquida: ni fila ni acuerdo posible", async () => {
    const { org, admin } = await makeStudio();
    const owner = await makeTeacherProfile(org.id, "La Dueña", { kind: "OWNER_TEACHER" });

    const overview = await settlementOverview(admin, PREV);
    expect(overview.teachers.map((t) => t.displayName)).toEqual(["Caro Suárez"]);
    await expect(
      setAgreement(admin, { teacherId: owner.id, studioPercent: 30, validFrom: "2026-01-01" }),
    ).rejects.toThrow(AgreementRuleError);
  });

  it("una STAFF desvinculada (revocada) SIGUE liquidando: la plata no desaparece", async () => {
    const { admin, profile } = await makeStudio();
    // makeTeacherProfile ya la crea desvinculada (membershipUserId null).
    const overview = await settlementOverview(admin, PREV);
    expect(overview.teachers[0]).toMatchObject({ teacherId: profile.id, linked: false });
  });

  it("un TEACHER no ve el overview ni acuerdos ajenos (matriz §4)", async () => {
    const { org } = await makeStudio();
    const teacher = await actorIn(org.id, "TEACHER");

    await expect(settlementOverview(teacher, PREV)).rejects.toThrow(ForbiddenError);
    await expect(listAgreements(teacher, "cualquiera")).rejects.toThrow(ForbiddenError);
  });
});

describe("cerrar → congelar → PAID (RN6 + RN12 completa)", () => {
  async function paidStudio() {
    const fixture = await makeStudio();
    const charge = await makeCharge(fixture.org.id, fixture.enrollment.id, {
      period: PREV,
      amount: 18000,
    });
    const { id: paymentId } = await createPayment(fixture.org.id, ALL, {
      studentId: fixture.student.id,
      amount: 18000,
      method: "CASH",
      paidAt: `${PREV}-15`,
      allocations: [{ chargeId: charge.id, amount: 18000 }],
    });
    return { ...fixture, charge, paymentId };
  }

  it("cerrar persiste los números, vincula el pago y el doble cierre rebota", async () => {
    const { admin, profile, paymentId } = await paidStudio();

    const { settlementId, numbers } = await closeSettlement(admin, profile.id, PREV);
    expect(numbers).toMatchObject({ gross: 18000, studioShare: 5400, netToTeacher: 12600 });

    const stored = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(stored.status).toBe("CLOSED");
    expect(stored.gross.toNumber()).toBe(18000);
    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.settlementId).toBe(settlementId);

    await expect(closeSettlement(admin, profile.id, PREV)).rejects.toThrow(
      "Esa liquidación ya está cerrada.",
    );
  });

  it("un pago congelado NO se elimina (RN12): el server lo rechaza nombrando el período", async () => {
    const { org, admin, profile, paymentId } = await paidStudio();
    await closeSettlement(admin, profile.id, PREV);

    await expect(deletePayment(org.id, ALL, paymentId)).rejects.toThrow(PaymentRuleError);
    await expect(deletePayment(org.id, ALL, paymentId)).rejects.toThrow(PREV);
    expect(await db.payment.count({ where: { id: paymentId } })).toBe(1);
  });

  it("el período EN CURSO no se cierra: es un borrador vivo", async () => {
    const { admin, profile } = await paidStudio();
    await expect(closeSettlement(admin, profile.id, CUR)).rejects.toThrow(
      "El período en curso todavía está abierto",
    );
  });

  it("PAID solo desde CLOSED, una vez", async () => {
    const { admin, profile } = await paidStudio();
    const { settlementId } = await closeSettlement(admin, profile.id, PREV);

    await markSettlementPaid(admin, settlementId);
    const stored = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(stored.status).toBe("PAID");
    expect(stored.paidAt).not.toBeNull();

    await expect(markSettlementPaid(admin, settlementId)).rejects.toThrow(SettlementRuleError);
  });

  it("un TEACHER no cierra ni marca PAID", async () => {
    const { org, admin, profile } = await paidStudio();
    const teacher = await actorIn(org.id, "TEACHER");

    await expect(closeSettlement(teacher, profile.id, PREV)).rejects.toThrow(ForbiddenError);
    const { settlementId } = await closeSettlement(admin, profile.id, PREV);
    await expect(markSettlementPaid(teacher, settlementId)).rejects.toThrow(ForbiddenError);
  });

  it("RN6-bis tardía: el crédito del cron sobre un pago YA liquidado cae al período donde ocurre", async () => {
    const { org, admin, profile, student, enrollment } = await makeStudio();
    const prevCharge = await makeCharge(org.id, enrollment.id, { period: PREV, amount: 17000 });
    // Paga $20.000 el mes pasado: $17.000 imputados, $3.000 a favor.
    await createPayment(org.id, ALL, {
      studentId: student.id,
      amount: 20000,
      method: "CASH",
      paidAt: `${PREV}-10`,
      allocations: [{ chargeId: prevCharge.id, amount: 17000 }],
    });

    // La dueña cierra el mes pasado: gross 17.000 congelado.
    const { settlementId } = await closeSettlement(admin, profile.id, PREV);
    const closed = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(closed.gross.toNumber()).toBe(17000);

    // El cron del mes nuevo genera la cuota y aplica el crédito: PERMITIDO (el saldo de
    // la alumna sigue vivo), y esos $3.000 liquidan en el período en que OCURREN.
    await makeCharge(org.id, enrollment.id, { period: CUR, amount: 17000 });
    const { applied } = await applyStudentCredit(org.id, student.id, today);
    expect(applied).toBe(1);

    // El cierre viejo no se movió un centavo…
    const still = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(still.gross.toNumber()).toBe(17000);

    // …y el borrador del mes en curso trae los $3.000 como imputación tardía.
    const detail = await settlementDetail(admin, ALL, profile.id, CUR);
    expect(detail.numbers.gross).toBe(3000);
    const late = detail.payments.find((p) => p.late);
    expect(late).toMatchObject({ allocatedToTeacher: 3000, collectedByTeacher: false });
  });
});

describe("la vista del profe (HU6.4) y el drill-down", () => {
  it("el drill-down trae pagos, tramos y el cambio de porcentaje partido en dos", async () => {
    const { org, admin, profile, enrollment, student } = await makeStudio();
    // Cambio de porcentaje a mitad del mes pasado: 30% → 40% desde el 16.
    await setAgreement(admin, {
      teacherId: profile.id,
      studioPercent: 40,
      validFrom: `${PREV}-16`,
    });
    const c1 = await makeCharge(org.id, enrollment.id, { period: TWO_AGO, amount: 10000 });
    const c2 = await makeCharge(org.id, enrollment.id, { period: PREV, amount: 10000 });
    await createPayment(org.id, ALL, {
      studentId: student.id,
      amount: 10000,
      method: "CASH",
      paidAt: `${PREV}-10`,
      allocations: [{ chargeId: c1.id, amount: 10000 }],
    });
    await createPayment(org.id, ALL, {
      studentId: student.id,
      amount: 10000,
      method: "CASH",
      paidAt: `${PREV}-20`,
      allocations: [{ chargeId: c2.id, amount: 10000 }],
    });

    const detail = await settlementDetail(admin, ALL, profile.id, PREV);
    expect(detail.tranches.map((t) => [t.studioPercent, t.gross, t.share])).toEqual([
      [30, 10000, 3000],
      [40, 10000, 4000],
    ]);
    expect(detail.numbers.studioShare).toBe(7000);
    expect(detail.payments).toHaveLength(2);
  });

  it("la profe ve LA SUYA (borrador + historial); la ajena no existe para ella", async () => {
    const { org, admin, profile } = await makeStudio();
    const other = await makeTeacherProfile(org.id, "Otra Profe");
    const scope: DataScope = { kind: "teacher", teacherProfileId: profile.id };
    const teacherActor = await actorIn(org.id, "TEACHER");

    // Historial: un período viejo cerrado.
    const student2 = await makeStudent(org.id, "Alumna Dos");
    const group2 = await makeGroup(org.id, "Grupo Dos", { teacherId: profile.id });
    const enrollment2 = await makeEnrollment(org.id, student2.id, group2.id);
    const charge = await makeCharge(org.id, enrollment2.id, { period: TWO_AGO, amount: 12000 });
    await createPayment(org.id, ALL, {
      studentId: student2.id,
      amount: 12000,
      method: "CASH",
      paidAt: `${TWO_AGO}-05`,
      allocations: [{ chargeId: charge.id, amount: 12000 }],
    });
    await closeSettlement(admin, profile.id, TWO_AGO);

    const mine = await teacherSettlements(org.id, scope);
    expect(mine.current?.state).toBe("draft");
    expect(mine.history).toHaveLength(1);
    expect(mine.history[0]).toMatchObject({
      state: "closed",
      numbers: { gross: 12000, studioShare: 3600, netToTeacher: 8400 },
    });

    // El detalle propio sí; el ajeno, no.
    const own = await settlementDetail(teacherActor, scope, profile.id, TWO_AGO);
    expect(own.numbers.gross).toBe(12000);
    await expect(settlementDetail(teacherActor, scope, other.id, TWO_AGO)).rejects.toThrow(
      "Esta liquidación no es tuya.",
    );
  });

  it("auto-atribución (S7×S9): el teacher que cobra en mano queda como receivedById aunque el cliente mienta", async () => {
    const { org, profile, student, enrollment } = await makeStudio();
    const spoofTarget = await makeTeacherProfile(org.id, "Otra Profe");
    await makeCharge(org.id, enrollment.id, { period: CUR, amount: 18000 });
    const scope: DataScope = { kind: "teacher", teacherProfileId: profile.id };

    const { id } = await createPayment(org.id, scope, {
      studentId: student.id,
      amount: 18000,
      method: "CASH",
      receivedBy: "TEACHER",
      receivedById: spoofTarget.id, // forjado: se ignora
      paidAt: today,
    });

    const stored = await db.payment.findUniqueOrThrow({ where: { id } });
    expect(stored.receivedById).toBe(profile.id);
  });
});
