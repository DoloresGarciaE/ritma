import { describe, expect, it } from "vitest";

import {
  addMonths,
  dateInPeriod,
  daysInPeriod,
  periodOf,
  todayInTz,
  weekdayOf,
  DEFAULT_TIMEZONE,
} from "@/lib/dates";
import { db } from "@/lib/db";
import {
  AgreementRuleError,
  setAgreement,
  setRentalAgreement,
  listRentalAgreements,
} from "@/server/services/agreements";
import { createEnrollment, enrollMany, EnrollmentRuleError } from "@/server/services/enrollments";
import { dashboardMetrics, periodRevenue } from "@/server/services/metrics";
import { ForbiddenError, type Actor, type DataScope } from "@/server/services/permissions";
import {
  markRentalPaid,
  rentalDetail,
  rentalsOverview,
  RentalRuleError,
  updateRentalAmount,
  waiveRentalCharge,
} from "@/server/services/rentals";
import { settlementOverview } from "@/server/services/settlements";
import { createExternalProfile, listExternals, TeamRuleError } from "@/server/services/team";
import { runGenerateRentals } from "@/server/system/generate-rentals";
import { runMarkOverdue } from "@/server/system/mark-overdue";

import {
  makeAllocation,
  makeCharge,
  makeEnrollment,
  makeGroup,
  makeMember,
  makeOrg,
  makePayment,
  makeRentalAgreement,
  makeRentalCharge,
  makeSession,
  makeSlot,
  makeSpace,
  makeStudent,
  makeTeacherProfile,
} from "./factories";

/**
 * S10, la mitad con base: la generación idempotente del cron (RN7/RN8), los estados del
 * cargo (RN3), RN13 (los grupos de un externo no llevan inscripciones), la matriz de
 * roles y los reportes que cuadran contra el dashboard. La fórmula pura vive en
 * src/server/services/rentals.test.ts.
 */

const ALL: DataScope = { kind: "all" };
const today = todayInTz(DEFAULT_TIMEZONE);
const CUR = periodOf(today);
const PREV = addMonths(CUR, -1);

async function actorIn(orgId: string, role: "OWNER" | "ADMIN" | "TEACHER"): Promise<Actor> {
  const member = await makeMember(orgId, role);
  return { userId: member.userId, orgId, role };
}

/** Las fechas de `period` que caen en `weekday` (para contar ocurrencias esperadas). */
function datesOn(period: string, weekday: number): string[] {
  const dates: string[] = [];
  for (let day = 1; day <= daysInPeriod(period); day++) {
    const date = dateInPeriod(period, day);
    if (weekdayOf(date) === weekday) dates.push(date);
  }
  return dates;
}

/** Un estudio con una externa PER_SESSION $5.000 y su grupo de los lunes en un salón. */
async function makeStudioWithExternal() {
  const org = await makeOrg("Estudio Faro");
  const admin = await actorIn(org.id, "ADMIN");
  const external = await makeTeacherProfile(org.id, "Marina Prueba", { kind: "EXTERNAL" });
  await makeRentalAgreement(org.id, external.id, {
    rentalAmount: 5000,
    rentalPeriod: "PER_SESSION",
    validFrom: "2026-01-01",
  });
  const space = await makeSpace(org.id, "Terraza");
  const group = await makeGroup(org.id, "Tango externo", {
    teacherId: external.id,
    spaceId: space.id,
  });
  const slot = await makeSlot(org.id, group.id, { weekday: 1, startTime: "10:00" });
  return { org, admin, external, group, slot, space };
}

describe("runGenerateRentals — el cron de RN7", () => {
  it("PER_SESSION: genera el período CERRADO contando dictadas, sin la cancelada (RN8), y es idempotente", async () => {
    const { org, external, group, slot } = await makeStudioWithExternal();
    const mondays = datesOn(PREV, 1);
    await makeSession(org.id, group.id, slot.id, mondays[0], { status: "CANCELLED" });

    const first = await runGenerateRentals(CUR);
    expect(first.created).toBeGreaterThanOrEqual(1);

    const charge = await db.rentalCharge.findUniqueOrThrow({
      where: { teacherId_period: { teacherId: external.id, period: PREV } },
    });
    expect(charge.sessionsCount).toBe(mondays.length - 1);
    expect(charge.amount.toNumber()).toBe((mondays.length - 1) * 5000);
    expect(charge.status).toBe("PENDING");
    // Vence en el mes de GENERACIÓN (día 10 default): no nace vencido.
    expect(charge.dueDate.toISOString().slice(0, 10)).toBe(dateInPeriod(CUR, 10));
    expect(charge.unspacedSessions).toBe(0);

    // Re-correr no duplica ni pisa — ni siquiera un monto editado a mano.
    await db.rentalCharge.update({ where: { id: charge.id }, data: { amount: 99000 } });
    const second = await runGenerateRentals(CUR);
    expect(second.created).toBe(0);
    const after = await db.rentalCharge.findMany({ where: { teacherId: external.id } });
    expect(after).toHaveLength(1);
    expect(after[0].amount.toNumber()).toBe(99000);
  });

  it("MONTHLY: el cargo fijo del período que ARRANCA, sin mirar sesiones", async () => {
    const org = await makeOrg("Estudio Mensual");
    const external = await makeTeacherProfile(org.id, "Externa Mensual", { kind: "EXTERNAL" });
    await makeRentalAgreement(org.id, external.id, {
      rentalAmount: 80000,
      rentalPeriod: "MONTHLY",
      validFrom: "2026-01-01",
    });

    await runGenerateRentals(CUR);

    const charges = await db.rentalCharge.findMany({ where: { teacherId: external.id } });
    expect(charges).toHaveLength(1);
    expect(charges[0].period).toBe(CUR);
    expect(charges[0].amount.toNumber()).toBe(80000);
    expect(charges[0].sessionsCount).toBe(0);
  });

  it("PER_HOUR: suma duraciones mixtas; el grupo sin salón cuenta y queda señalado", async () => {
    const org = await makeOrg("Estudio Horas");
    const external = await makeTeacherProfile(org.id, "Externa Horas", { kind: "EXTERNAL" });
    await makeRentalAgreement(org.id, external.id, {
      rentalAmount: 6000,
      rentalPeriod: "PER_HOUR",
      validFrom: "2026-01-01",
    });
    const space = await makeSpace(org.id, "Salón A");
    const withSpace = await makeGroup(org.id, "Con salón", {
      teacherId: external.id,
      spaceId: space.id,
    });
    await makeSlot(org.id, withSpace.id, { weekday: 2, durationMin: 90 });
    const noSpace = await makeGroup(org.id, "Sin salón", { teacherId: external.id });
    await makeSlot(org.id, noSpace.id, { weekday: 4, durationMin: 60 });

    await runGenerateRentals(CUR);

    const tuesdays = datesOn(PREV, 2).length;
    const thursdays = datesOn(PREV, 4).length;
    const minutes = tuesdays * 90 + thursdays * 60;
    const charge = await db.rentalCharge.findUniqueOrThrow({
      where: { teacherId_period: { teacherId: external.id, period: PREV } },
    });
    expect(charge.minutesTotal).toBe(minutes);
    expect(charge.amount.toNumber()).toBe((minutes * 6000) / 60);
    expect(charge.sessionsCount).toBe(tuesdays + thursdays);
    expect(charge.unspacedSessions).toBe(thursdays);
  });

  it("la movida al mes SIGUIENTE no cuenta en el cerrado: cobra donde se dictó", async () => {
    const { org, external, group, slot } = await makeStudioWithExternal();
    const mondays = datesOn(PREV, 1);
    const last = mondays[mondays.length - 1];
    await makeSession(org.id, group.id, slot.id, last, {
      movedToDate: dateInPeriod(CUR, 2),
      movedToStartTime: "10:00",
    });

    await runGenerateRentals(CUR);

    const charge = await db.rentalCharge.findUniqueOrThrow({
      where: { teacherId_period: { teacherId: external.id, period: PREV } },
    });
    expect(charge.sessionsCount).toBe(mondays.length - 1);
  });

  it("sin acuerdo no genera; sin sesiones tampoco (cargo cero no existe)", async () => {
    const org = await makeOrg("Estudio Vacío");
    // Externa sin acuerdo, con grupo y franja.
    const noAgreement = await makeTeacherProfile(org.id, "Sin Acuerdo", { kind: "EXTERNAL" });
    const group = await makeGroup(org.id, "Grupo sin acuerdo", { teacherId: noAgreement.id });
    await makeSlot(org.id, group.id, { weekday: 3 });
    // Externa con acuerdo por sesión, sin grupos.
    const noGroups = await makeTeacherProfile(org.id, "Sin Grupos", { kind: "EXTERNAL" });
    await makeRentalAgreement(org.id, noGroups.id, { rentalPeriod: "PER_SESSION" });

    await runGenerateRentals(CUR);

    expect(await db.rentalCharge.count({ where: { orgId: org.id } })).toBe(0);
  });
});

describe("estados del cargo — RN3 sobre alquileres", () => {
  it("markOverdue vence un PENDING pasado de fecha; PAID y WAIVED ni se miran", async () => {
    const org = await makeOrg("Estudio Vencido");
    const external = await makeTeacherProfile(org.id, "Externa", { kind: "EXTERNAL" });
    const due = await makeRentalCharge(org.id, external.id, {
      period: PREV,
      dueDate: "2026-01-05",
    });
    const paid = await makeRentalCharge(org.id, external.id, {
      period: "2026-01",
      dueDate: "2026-01-05",
      status: "PAID",
    });

    const summary = await runMarkOverdue();

    expect(summary.rentalsMarked).toBeGreaterThanOrEqual(1);
    expect((await db.rentalCharge.findUniqueOrThrow({ where: { id: due.id } })).status).toBe(
      "OVERDUE",
    );
    expect((await db.rentalCharge.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe(
      "PAID",
    );
  });

  it("marcar pagado: completo, con fecha y método; una vencida paga directo; dos veces no", async () => {
    const org = await makeOrg("Estudio Pago");
    const admin = await actorIn(org.id, "ADMIN");
    const external = await makeTeacherProfile(org.id, "Externa", { kind: "EXTERNAL" });
    const charge = await makeRentalCharge(org.id, external.id, { status: "OVERDUE" });

    await markRentalPaid(admin, charge.id, { paidAt: dateInPeriod(CUR, 5), method: "TRANSFER" });

    const stored = await db.rentalCharge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(stored.status).toBe("PAID");
    expect(stored.method).toBe("TRANSFER");
    expect(stored.paidAt?.toISOString().slice(0, 10)).toBe(dateInPeriod(CUR, 5));

    await expect(
      markRentalPaid(admin, charge.id, { paidAt: dateInPeriod(CUR, 6), method: "CASH" }),
    ).rejects.toThrow(RentalRuleError);
  });

  it("editar el monto: solo PENDING; exonerar: jamás una pagada", async () => {
    const org = await makeOrg("Estudio Reglas");
    const admin = await actorIn(org.id, "ADMIN");
    const external = await makeTeacherProfile(org.id, "Externa", { kind: "EXTERNAL" });
    const pending = await makeRentalCharge(org.id, external.id, { period: PREV });
    const paid = await makeRentalCharge(org.id, external.id, {
      period: "2026-02",
      status: "PAID",
    });

    await updateRentalAmount(admin, pending.id, 12345);
    expect(
      (await db.rentalCharge.findUniqueOrThrow({ where: { id: pending.id } })).amount.toNumber(),
    ).toBe(12345);
    await expect(updateRentalAmount(admin, paid.id, 1)).rejects.toThrow(RentalRuleError);

    await waiveRentalCharge(admin, pending.id);
    expect((await db.rentalCharge.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(
      "WAIVED",
    );
    await expect(waiveRentalCharge(admin, paid.id)).rejects.toThrow(RentalRuleError);
  });
});

describe("RN13 — los grupos de un externo no llevan inscripciones", () => {
  it("inscribir (individual y en tanda) a un grupo de externo se rechaza con el motivo", async () => {
    const { org } = await makeStudioWithExternal();
    const externalGroup = await db.classGroup.findFirstOrThrow({
      where: { orgId: org.id, name: "Tango externo" },
    });
    const student = await makeStudent(org.id, "Alumna Ajena");

    const input = {
      studentId: student.id,
      groupId: externalGroup.id,
      plan: "MONTHLY" as const,
      price: 10000,
      startDate: dateInPeriod(CUR, 1),
    };
    await expect(createEnrollment(org.id, ALL, input)).rejects.toThrow(EnrollmentRuleError);
    await expect(createEnrollment(org.id, ALL, input)).rejects.toThrow(
      "El grupo de un profe externo no lleva inscripciones",
    );
    await expect(
      enrollMany(org.id, ALL, {
        groupId: externalGroup.id,
        studentIds: [student.id],
        plan: "MONTHLY",
        price: 10000,
        startDate: dateInPeriod(CUR, 1),
      }),
    ).rejects.toThrow(EnrollmentRuleError);

    expect(await db.enrollment.count({ where: { groupId: externalGroup.id } })).toBe(0);
  });
});

describe("matriz de roles y acuerdos", () => {
  it("un TEACHER no ve ni toca alquileres, externos ni sus acuerdos", async () => {
    const { org, external } = await makeStudioWithExternal();
    const teacher = await actorIn(org.id, "TEACHER");
    const charge = await makeRentalCharge(org.id, external.id, { period: "2026-03" });

    await expect(rentalsOverview(teacher, PREV)).rejects.toThrow(ForbiddenError);
    await expect(rentalDetail(teacher, external.id, PREV)).rejects.toThrow(ForbiddenError);
    await expect(updateRentalAmount(teacher, charge.id, 1000)).rejects.toThrow(ForbiddenError);
    await expect(
      markRentalPaid(teacher, charge.id, { paidAt: dateInPeriod(CUR, 5), method: "CASH" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(waiveRentalCharge(teacher, charge.id)).rejects.toThrow(ForbiddenError);
    await expect(listExternals(teacher)).rejects.toThrow(ForbiddenError);
    await expect(createExternalProfile(teacher, "Nadie")).rejects.toThrow(ForbiddenError);
    await expect(
      setRentalAgreement(teacher, {
        teacherId: external.id,
        rentalAmount: 1000,
        rentalPeriod: "MONTHLY",
        validFrom: "2026-01-01",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("acuerdos cruzados se rechazan: porcentaje a un externo, alquiler a una staff", async () => {
    const { org, admin, external } = await makeStudioWithExternal();
    const staff = await makeTeacherProfile(org.id, "Staff Uno");

    await expect(
      setAgreement(admin, { teacherId: external.id, studioPercent: 30, validFrom: "2026-02-01" }),
    ).rejects.toThrow(AgreementRuleError);
    await expect(
      setRentalAgreement(admin, {
        teacherId: staff.id,
        rentalAmount: 5000,
        rentalPeriod: "PER_SESSION",
        validFrom: "2026-02-01",
      }),
    ).rejects.toThrow(AgreementRuleError);
  });

  it("el alta de externa y su historial de alquiler funcionan para owner/admin", async () => {
    const org = await makeOrg("Estudio Alta");
    const admin = await actorIn(org.id, "ADMIN");

    const { id } = await createExternalProfile(admin, "  Marina Sol  ");
    const externals = await listExternals(admin);
    expect(externals.map((e) => e.displayName)).toContain("Marina Sol");

    await setRentalAgreement(admin, {
      teacherId: id,
      rentalAmount: 5000,
      rentalPeriod: "PER_SESSION",
      validFrom: "2026-01-01",
    });
    await setRentalAgreement(admin, {
      teacherId: id,
      rentalAmount: 6000,
      rentalPeriod: "PER_SESSION",
      validFrom: "2026-06-01",
    });
    const history = await listRentalAgreements(admin, id);
    expect(history.map((h) => h.rentalAmount)).toEqual([6000, 5000]);

    await expect(createExternalProfile(admin, "   ")).rejects.toThrow(TeamRuleError);
  });

  it("un externo JAMÁS aparece en liquidaciones (S9 intacto)", async () => {
    const { org, admin, external } = await makeStudioWithExternal();
    await makeRentalCharge(org.id, external.id, { period: PREV });

    const overview = await settlementOverview(admin, PREV);
    expect(overview.teachers.map((t) => t.teacherId)).not.toContain(external.id);
  });
});

describe("rentalsOverview y rentalDetail — lo que se muestra", () => {
  it("cada externo con su cargo, y el motivo CANTADO cuando no hay", async () => {
    const org = await makeOrg("Estudio Overview");
    const admin = await actorIn(org.id, "ADMIN");
    const charged = await makeTeacherProfile(org.id, "Con Cargo", { kind: "EXTERNAL" });
    await makeRentalAgreement(org.id, charged.id);
    await makeRentalCharge(org.id, charged.id, { period: PREV, amount: 20000 });
    const noCharge = await makeTeacherProfile(org.id, "Sin Cargo", { kind: "EXTERNAL" });
    await makeRentalAgreement(org.id, noCharge.id);
    const noAgreement = await makeTeacherProfile(org.id, "Sin Acuerdo", { kind: "EXTERNAL" });

    const overview = await rentalsOverview(admin, PREV);

    const byId = new Map(overview.rows.map((row) => [row.teacherId, row]));
    expect(byId.get(charged.id)?.reason).toBe("charged");
    expect(byId.get(charged.id)?.charge?.amount).toBe(20000);
    expect(byId.get(noCharge.id)?.reason).toBe("no-charge");
    expect(byId.get(noAgreement.id)?.reason).toBe("no-agreement");
  });

  it("el detalle lista las sesiones del período con la cancelada marcada y la tarifa vigente", async () => {
    const { org, admin, external, group, slot } = await makeStudioWithExternal();
    const mondays = datesOn(PREV, 1);
    await makeSession(org.id, group.id, slot.id, mondays[0], { status: "CANCELLED" });
    await runGenerateRentals(CUR);

    const detail = await rentalDetail(admin, external.id, PREV);

    expect(detail.rate).toBe(5000);
    expect(detail.rentalPeriod).toBe("PER_SESSION");
    expect(detail.sessions).toHaveLength(mondays.length);
    expect(detail.sessions.filter((s) => s.cancelled)).toHaveLength(1);
    expect(detail.sessions[0].spaceName).toBe("Terraza");
    expect(detail.charge?.sessionsCount).toBe(mondays.length - 1);
  });
});

describe("periodRevenue — HU7.2 con la vara del dashboard", () => {
  it("por profe y por disciplina suman EXACTO el total, y el total cuadra con el Inicio", async () => {
    const org = await makeOrg("Estudio Reportes");
    const profeA = await makeTeacherProfile(org.id, "Profe A");
    const profeB = await makeTeacherProfile(org.id, "Profe B");
    const groupA = await makeGroup(org.id, "Tango A", { teacherId: profeA.id });
    const groupB = await makeGroup(org.id, "Folklore B", { teacherId: profeB.id });
    const studentA = await makeStudent(org.id, "Alumna A");
    const studentB = await makeStudent(org.id, "Alumna B");
    const enrollA = await makeEnrollment(org.id, studentA.id, groupA.id);
    const enrollB = await makeEnrollment(org.id, studentB.id, groupB.id);
    const chargeA = await makeCharge(org.id, enrollA.id, { period: CUR, amount: 18000 });
    const chargeB = await makeCharge(org.id, enrollB.id, { period: CUR, amount: 15000 });
    const payA = await makePayment(org.id, studentA.id, { amount: 18000 });
    const payB = await makePayment(org.id, studentB.id, { amount: 10000 });
    await makeAllocation(org.id, payA.id, chargeA.id, 18000);
    await makeAllocation(org.id, payB.id, chargeB.id, 10000);

    // Alquileres: solo el PAGADO entra a la línea.
    const external = await makeTeacherProfile(org.id, "Externa", { kind: "EXTERNAL" });
    await makeRentalCharge(org.id, external.id, { period: CUR, amount: 20000, status: "PAID" });
    await makeRentalCharge(org.id, external.id, { period: PREV, amount: 9000 });

    const revenue = await periodRevenue(org.id, CUR);

    expect(revenue.total).toBe(28000);
    expect(revenue.byTeacher.map((r) => [r.label, r.total])).toEqual([
      ["Profe A", 18000],
      ["Profe B", 10000],
    ]);
    const disciplineSum = revenue.byDiscipline.reduce((sum, row) => sum + row.total, 0);
    expect(disciplineSum).toBe(28000);
    expect(revenue.rentalsCollected).toBe(20000);

    // La MISMA vara que el dashboard (S6): cuadran por construcción.
    const metrics = await dashboardMetrics(org.id, ALL);
    expect(metrics.collected).toBe(revenue.total);
  });
});
