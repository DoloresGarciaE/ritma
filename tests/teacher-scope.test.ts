import { describe, expect, it } from "vitest";

import { DEFAULT_TIMEZONE, periodOf, todayInTz } from "@/lib/dates";
import { db } from "@/lib/db";
import { listChargesForStudent, debtorsForPeriod } from "@/server/services/charges";
import {
  createEnrollment,
  endEnrollment,
  listEnrollmentsForStudent,
} from "@/server/services/enrollments";
import { getGroup, listGroups, updateGroup } from "@/server/services/groups";
import { dashboardMetrics } from "@/server/services/metrics";
import {
  createPayment,
  deletePayment,
  getReceiptToken,
  listPaymentsForStudent,
  paymentContext,
} from "@/server/services/payments";
import type { DataScope } from "@/server/services/permissions";
import { buildReminder, logReminder, ReminderRuleError } from "@/server/services/reminders";
import { cancelSession, weekData } from "@/server/services/sessions";
import { getStudent, listStudents, updateStudent } from "@/server/services/students";

import { makeGroup, makeOrg, makeSlot, makeStudent, makeTeacherProfile } from "./factories";

/**
 * S7 — el scoping de TEACHER aplicado: la matriz rol×recurso del Plan §4, POR API.
 *
 * "El scope de un teacher es siempre sus grupos y los alumnos inscriptos en ellos": un
 * estudio con dos profes (A y B) y un grupo sin asignar, y se verifica que A no lee ni
 * escribe NADA de B — grupos, alumnos, cuotas, pagos, sesiones, recordatorios — por los
 * servicios, no por la pantalla. La observación [!] del recorrido de escenarios (la
 * docente dual veía TODO Meraki) muere acá.
 */

const ALL: DataScope = { kind: "all" };

const today = todayInTz(DEFAULT_TIMEZONE);
const period = periodOf(today);
const firstOfPeriod = `${period}-01`;

/** Un estudio con dos profes asignados y un grupo sin profe. */
async function makeStudio() {
  const org = await makeOrg("Estudio Compás");
  const profileA = await makeTeacherProfile(org.id, "Profe A");
  const profileB = await makeTeacherProfile(org.id, "Profe B");

  const groupA = await makeGroup(org.id, "Grupo de A", { teacherId: profileA.id });
  const groupB = await makeGroup(org.id, "Grupo de B", { teacherId: profileB.id });
  const unassigned = await makeGroup(org.id, "Sin profe");

  const slotA = await makeSlot(org.id, groupA.id, { weekday: 2, startTime: "18:00" });
  const slotB = await makeSlot(org.id, groupB.id, { weekday: 4, startTime: "20:00" });

  const scopeA: DataScope = { kind: "teacher", teacherProfileId: profileA.id };

  return { org, profileA, profileB, groupA, groupB, unassigned, slotA, slotB, scopeA };
}

/** Inscribe con el servicio real (crea la cuota inicial del período con el motor). */
async function enroll(orgId: string, studentId: string, groupId: string, price: number) {
  return createEnrollment(orgId, ALL, {
    studentId,
    groupId,
    plan: "MONTHLY",
    price,
    startDate: firstOfPeriod,
  });
}

describe("lecturas: el teacher ve SOLO su mundo", () => {
  it("grupos: los suyos — ni los de B ni el 'sin profe asignado'", async () => {
    const { org, scopeA } = await makeStudio();

    expect((await listGroups(org.id, scopeA)).map((g) => g.name)).toEqual(["Grupo de A"]);
    // Owner/admin (scope all) ven los tres, incluido el sin asignar.
    expect(await listGroups(org.id, ALL)).toHaveLength(3);
  });

  it("getGroup de un grupo ajeno o sin asignar → null, como si no existiera", async () => {
    const { org, groupB, unassigned, groupA, scopeA } = await makeStudio();

    expect(await getGroup(org.id, scopeA, groupB.id)).toBeNull();
    expect(await getGroup(org.id, scopeA, unassigned.id)).toBeNull();
    expect((await getGroup(org.id, scopeA, groupA.id))?.name).toBe("Grupo de A");
  });

  it("alumnos: inscriptos en sus grupos (la compartida sí; la de B no)", async () => {
    const { org, groupA, groupB, scopeA } = await makeStudio();
    const mine = await makeStudent(org.id, "Alumna de A");
    const theirs = await makeStudent(org.id, "Alumna de B");
    const shared = await makeStudent(org.id, "Alumna Compartida");
    await enroll(org.id, mine.id, groupA.id, 10000);
    await enroll(org.id, theirs.id, groupB.id, 5000);
    await enroll(org.id, shared.id, groupA.id, 10000);
    await enroll(org.id, shared.id, groupB.id, 5000);

    const seen = (await listStudents(org.id, scopeA)).map((s) => s.name);
    expect(seen).toEqual(["Alumna Compartida", "Alumna de A"]);

    expect(await getStudent(org.id, scopeA, theirs.id)).toBeNull();
    // La ficha de la compartida sí es suya…
    expect((await getStudent(org.id, scopeA, shared.id))?.name).toBe("Alumna Compartida");
    // …pero sus inscripciones listadas son SOLO las del profe que mira.
    const enrollments = await listEnrollmentsForStudent(org.id, scopeA, shared.id);
    expect(enrollments.map((e) => e.group.name)).toEqual(["Grupo de A"]);
  });

  it("agenda: la semana trae SOLO las ocurrencias de sus grupos", async () => {
    const { org, scopeA } = await makeStudio();

    // Semana fija del dominio (lunes 2026-07-13): martes es de A, jueves de B.
    const week = await weekData(org.id, scopeA, "2026-07-13");
    expect(week.occurrences.map((o) => o.groupName)).toEqual(["Grupo de A"]);
    expect(week.occurrences[0]?.teacherName).toBe("Profe A");

    const all = await weekData(org.id, ALL, "2026-07-13");
    expect(all.occurrences).toHaveLength(2);
  });

  it("cuotas de la compartida: SOLO las de sus inscripciones; deudores ídem", async () => {
    const { org, groupA, groupB, scopeA } = await makeStudio();
    const shared = await makeStudent(org.id, "Alumna Compartida");
    await enroll(org.id, shared.id, groupA.id, 10000);
    await enroll(org.id, shared.id, groupB.id, 5000);

    const charges = await listChargesForStudent(org.id, scopeA, shared.id);
    expect(charges.map((c) => c.group.name)).toEqual(["Grupo de A"]);

    const debt = await debtorsForPeriod(org.id, scopeA, period);
    expect(debt.total).toBe(10000);
    expect(debt.debtors.map((d) => d.group.name)).toEqual(["Grupo de A"]);

    const orgDebt = await debtorsForPeriod(org.id, ALL, period);
    expect(orgDebt.total).toBe(15000);
  });

  it("el Inicio del teacher cuadra con SUS pantallas (misma vara, scoped)", async () => {
    const { org, groupA, groupB, scopeA } = await makeStudio();
    const mine = await makeStudent(org.id, "Alumna de A");
    const theirs = await makeStudent(org.id, "Alumna de B");
    await enroll(org.id, mine.id, groupA.id, 10000);
    await enroll(org.id, theirs.id, groupB.id, 5000);
    // Un pago a la cuota de A: "cobrado" del teacher = imputaciones a SUS cuotas.
    await createPayment(org.id, ALL, {
      studentId: mine.id,
      amount: 4000,
      method: "CASH",
      paidAt: today,
    });

    const metrics = await dashboardMetrics(org.id, scopeA);
    const debt = await debtorsForPeriod(org.id, scopeA, period);

    expect(metrics.collected).toBe(4000);
    expect(metrics.pending).toBe(debt.total);
    expect(metrics.debtors).toBe(debt.students.length);
    expect(metrics.todayClasses.every((c) => c.groupName === "Grupo de A")).toBe(true);
  });

  it("pagos: los de sus alumnos; los de la alumna de B no existen para A", async () => {
    const { org, groupA, groupB, scopeA } = await makeStudio();
    const mine = await makeStudent(org.id, "Alumna de A");
    const theirs = await makeStudent(org.id, "Alumna de B");
    await enroll(org.id, mine.id, groupA.id, 10000);
    await enroll(org.id, theirs.id, groupB.id, 5000);
    await createPayment(org.id, ALL, {
      studentId: mine.id,
      amount: 1000,
      method: "CASH",
      paidAt: today,
    });
    const bPayment = await createPayment(org.id, ALL, {
      studentId: theirs.id,
      amount: 2000,
      method: "CASH",
      paidAt: today,
    });

    expect(await listPaymentsForStudent(org.id, scopeA, mine.id)).toHaveLength(1);
    expect(await listPaymentsForStudent(org.id, scopeA, theirs.id)).toEqual([]);
    // Ni el link del comprobante ajeno.
    expect(await getReceiptToken(org.id, scopeA, bPayment.id)).toBeNull();
  });

  it("teacher SIN perfil vinculado: scope VACÍO, jamás 'todo' (fail-closed)", async () => {
    const { org } = await makeStudio();
    const noProfile: DataScope = { kind: "teacher", teacherProfileId: null };

    expect(await listGroups(org.id, noProfile)).toEqual([]);
    expect(await listStudents(org.id, noProfile)).toEqual([]);
    expect((await weekData(org.id, noProfile, "2026-07-13")).occurrences).toEqual([]);
  });
});

describe("escrituras: el teacher opera lo suyo y NADA más", () => {
  it("cancelar una sesión de B desde A: la franja 'no pertenece'", async () => {
    const { org, slotB, slotA, scopeA } = await makeStudio();

    await expect(
      cancelSession(org.id, scopeA, { slotId: slotB.id, date: "2026-07-16" }),
    ).rejects.toThrow("La franja no pertenece a esta organización.");
    expect(await db.classSession.count({ where: { orgId: org.id } })).toBe(0);

    // La suya sí (martes 2026-07-14 es ocurrencia real de slotA).
    await cancelSession(org.id, scopeA, { slotId: slotA.id, date: "2026-07-14" });
    expect(await db.classSession.count({ where: { orgId: org.id } })).toBe(1);
  });

  it("editar el grupo de B desde A: rechazo total", async () => {
    const { org, groupB, scopeA } = await makeStudio();

    await expect(
      updateGroup(org.id, scopeA, groupB.id, {
        name: "Robado",
        disciplineId: groupB.disciplineId,
        defaultPrice: 1,
        slots: [],
      }),
    ).rejects.toThrow("El grupo no pertenece a esta organización.");

    const after = await db.classGroup.findUniqueOrThrow({ where: { id: groupB.id } });
    expect(after.name).toBe("Grupo de B");
  });

  it("editar SU grupo: nombre sí; precio y profe a cargo se fuerzan como están", async () => {
    const { org, groupA, profileA, profileB, scopeA } = await makeStudio();

    await updateGroup(org.id, scopeA, groupA.id, {
      name: "Mi grupo renombrado",
      disciplineId: groupA.disciplineId,
      // Una pantalla pinchada podría mandar cualquier cosa: el server la ignora.
      defaultPrice: 999999,
      teacherId: profileB.id,
      slots: [],
    });

    const after = await db.classGroup.findUniqueOrThrow({ where: { id: groupA.id } });
    expect(after.name).toBe("Mi grupo renombrado");
    expect(after.defaultPrice.toNumber()).toBe(20000); // el de la factory, intacto
    expect(after.teacherId).toBe(profileA.id); // sigue siendo SU grupo
  });

  it("inscribir en el grupo de B desde A: rechazo; en el suyo, funciona", async () => {
    const { org, groupA, groupB, scopeA } = await makeStudio();
    const student = await makeStudent(org.id, "Alumna Nueva");

    await expect(
      createEnrollment(org.id, scopeA, {
        studentId: student.id,
        groupId: groupB.id,
        plan: "MONTHLY",
        price: 5000,
        startDate: firstOfPeriod,
      }),
    ).rejects.toThrow("El grupo no pertenece a esta organización.");

    await createEnrollment(org.id, scopeA, {
      studentId: student.id,
      groupId: groupA.id,
      plan: "MONTHLY",
      price: 10000,
      startDate: firstOfPeriod,
    });
    // Recién ahora la alumna es "suya" y aparece en sus listas.
    expect((await listStudents(org.id, scopeA)).map((s) => s.name)).toEqual(["Alumna Nueva"]);
  });

  it("la baja de una inscripción de B desde A no existe", async () => {
    const { org, groupB, scopeA } = await makeStudio();
    const theirs = await makeStudent(org.id, "Alumna de B");
    await enroll(org.id, theirs.id, groupB.id, 5000);
    const enrollment = await db.enrollment.findFirstOrThrow({ where: { groupId: groupB.id } });

    await expect(endEnrollment(org.id, scopeA, enrollment.id, today)).rejects.toThrow(
      "La inscripción no pertenece a esta organización.",
    );
  });

  it("editar la ficha de una alumna de B desde A: P2025, nada cambia", async () => {
    const { org, groupB, scopeA } = await makeStudio();
    const theirs = await makeStudent(org.id, "Alumna de B");
    await enroll(org.id, theirs.id, groupB.id, 5000);

    await expect(
      updateStudent(org.id, scopeA, theirs.id, {
        name: "Hackeada",
        phone: null,
        email: null,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "P2025" });
  });

  it("registrar un pago a la alumna de B desde A: 'no pertenece'", async () => {
    const { org, groupB, scopeA } = await makeStudio();
    const theirs = await makeStudent(org.id, "Alumna de B");
    await enroll(org.id, theirs.id, groupB.id, 5000);

    await expect(
      createPayment(org.id, scopeA, {
        studentId: theirs.id,
        amount: 5000,
        method: "CASH",
        paidAt: today,
      }),
    ).rejects.toThrow("El alumno no pertenece a esta organización.");
    expect(await db.payment.count({ where: { orgId: org.id } })).toBe(0);
  });

  it("RN4 aclarada (decisión S7): el pago que registra A imputa SOLO a cuotas de A", async () => {
    const { org, groupA, groupB, scopeA } = await makeStudio();
    const shared = await makeStudent(org.id, "Alumna Compartida");
    await enroll(org.id, shared.id, groupA.id, 10000);
    await enroll(org.id, shared.id, groupB.id, 5000);

    // El contexto del sheet de A: SU cuota abierta, no la de B (y la deuda es la suya).
    const context = await paymentContext(org.id, scopeA, shared.id);
    expect(context.debt).toBe(10000);
    expect(context.openCharges).toHaveLength(1);

    // Sobra plata (12000 contra 10000): el excedente queda como crédito del alumno —
    // JAMÁS aterriza en la cuota de B, que A ni ve.
    await createPayment(org.id, scopeA, {
      studentId: shared.id,
      amount: 12000,
      method: "TRANSFER",
      paidAt: today,
    });

    const chargeA = await db.charge.findFirstOrThrow({
      where: { enrollment: { groupId: groupA.id } },
    });
    const chargeB = await db.charge.findFirstOrThrow({
      where: { enrollment: { groupId: groupB.id } },
    });
    expect(chargeA.status).toBe("PAID");
    expect(chargeB.status).toBe("PENDING");
    expect(await db.paymentAllocation.count({ where: { chargeId: chargeB.id } })).toBe(0);
  });

  it("eliminar el pago de una alumna de B desde A: 'no pertenece'", async () => {
    const { org, groupB, scopeA } = await makeStudio();
    const theirs = await makeStudent(org.id, "Alumna de B");
    await enroll(org.id, theirs.id, groupB.id, 5000);
    const payment = await createPayment(org.id, ALL, {
      studentId: theirs.id,
      amount: 5000,
      method: "CASH",
      paidAt: today,
    });

    await expect(deletePayment(org.id, scopeA, payment.id)).rejects.toThrow(
      "El pago no pertenece a esta organización.",
    );
    expect(await db.payment.count({ where: { id: payment.id } })).toBe(1);
  });

  it("recordar a la alumna de B desde A: no existe; a la compartida, con SU deuda", async () => {
    const { org, groupA, groupB, scopeA } = await makeStudio();
    const theirs = await makeStudent(org.id, "Alumna de B");
    const shared = await makeStudent(org.id, "Alumna Compartida");
    await enroll(org.id, theirs.id, groupB.id, 5000);
    await enroll(org.id, shared.id, groupA.id, 10000);
    await enroll(org.id, shared.id, groupB.id, 5000);

    await expect(
      logReminder(org.id, scopeA, { studentId: theirs.id, channel: "WHATSAPP_LINK" }),
    ).rejects.toThrow(ReminderRuleError);

    // {monto} del recordatorio de A = la deuda del período CON A (no los $15.000).
    const draft = await buildReminder(org.id, scopeA, shared.id, period);
    expect(draft.debt).toBe(10000);
    expect(draft.message).toContain("$10.000");
  });
});
