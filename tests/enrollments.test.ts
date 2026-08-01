import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import {
  createEnrollment,
  endEnrollment,
  EnrollmentRuleError,
  listActiveEnrollmentsForGroup,
  listEnrollmentsForStudent,
} from "@/server/services/enrollments";

import { makeEnrollment, makeGroup, makeOrg, makeStudent } from "./factories";

/**
 * Los servicios de inscripciones contra Postgres real (HU4.1, RN9): referencias cruzadas
 * verificadas ANTES de escribir, la cuota inicial anidada con orgId explícito y generada
 * por el MISMO motor puro que el cron, y la baja como endDate (nunca delete).
 *
 * Se fakea solo `Date`: "el período en curso" tiene que ser determinístico.
 */

const NOW = new Date("2026-07-15T12:00:00Z"); // 09:00 en Buenos Aires → período 2026-07

function freezeClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
}

afterEach(() => {
  vi.useRealTimers();
});

async function makeBase(orgName = "Danzas Malena") {
  const org = await makeOrg(orgName);
  const student = await makeStudent(org.id, "Sofía Herrera");
  const group = await makeGroup(org.id, "Árabe inicial", { defaultPrice: 18000 });
  return { org, student, group };
}

describe("createEnrollment — MONTHLY", () => {
  it("crea la inscripción Y su cuota del período en curso, con orgId explícito en la cuota", async () => {
    freezeClock();
    const { org, student, group } = await makeBase();

    const { id } = await createEnrollment(org.id, {
      studentId: student.id,
      groupId: group.id,
      plan: "MONTHLY",
      price: 18000,
      startDate: "2026-07-15",
    });

    // Verificación con db crudo: la escritura anidada NO pasa por el hook.
    const charges = await db.charge.findMany({ where: { enrollmentId: id } });
    expect(charges).toHaveLength(1);
    expect(charges[0].orgId).toBe(org.id);
    expect(charges[0].period).toBe("2026-07");
    expect(charges[0].amount.toNumber()).toBe(18000); // completa (RN2), aunque es día 15
    expect(charges[0].currency).toBe("ARS");
    expect(charges[0].dueDate.toISOString()).toBe("2026-07-10T00:00:00.000Z");
    expect(charges[0].status).toBe("PENDING");
  });

  it("alta futura (el mes que viene): SIN cuota hoy — la genera el cron cuando llegue (HU4.2)", async () => {
    freezeClock();
    const { org, student, group } = await makeBase();

    const { id } = await createEnrollment(org.id, {
      studentId: student.id,
      groupId: group.id,
      plan: "MONTHLY",
      price: 18000,
      startDate: "2026-08-01",
    });

    expect(await db.charge.count({ where: { enrollmentId: id } })).toBe(0);
  });

  it("alta RETROACTIVA: genera SOLO el período en curso, no fabrica deuda vieja (decisión S3)", async () => {
    freezeClock();
    const { org, student, group } = await makeBase();

    const { id } = await createEnrollment(org.id, {
      studentId: student.id,
      groupId: group.id,
      plan: "MONTHLY",
      price: 18000,
      startDate: "2026-03-01",
    });

    const charges = await db.charge.findMany({ where: { enrollmentId: id } });
    expect(charges.map((c) => c.period)).toEqual(["2026-07"]);
  });

  it("el vencimiento respeta el dueDay de la org", async () => {
    freezeClock();
    const { org, student, group } = await makeBase();
    await db.organization.update({ where: { id: org.id }, data: { dueDay: 28 } });

    const { id } = await createEnrollment(org.id, {
      studentId: student.id,
      groupId: group.id,
      plan: "MONTHLY",
      price: 18000,
      startDate: "2026-07-15",
    });

    const charge = await db.charge.findFirstOrThrow({ where: { enrollmentId: id } });
    expect(charge.dueDate.toISOString()).toBe("2026-07-28T00:00:00.000Z");
  });
});

describe("createEnrollment — DROP_IN (propuesta RN11)", () => {
  it("nace SIEMPRE con su cargo único: precio pactado, vence a 7 días del alta", async () => {
    freezeClock();
    const { org, student, group } = await makeBase();

    const { id } = await createEnrollment(org.id, {
      studentId: student.id,
      groupId: group.id,
      plan: "DROP_IN",
      price: 9000,
      startDate: "2026-07-30",
    });

    const charges = await db.charge.findMany({ where: { enrollmentId: id } });
    expect(charges).toHaveLength(1);
    expect(charges[0].amount.toNumber()).toBe(9000);
    expect(charges[0].period).toBe("2026-07");
    expect(charges[0].dueDate.toISOString()).toBe("2026-08-06T00:00:00.000Z"); // +7, cruza mes
    expect(charges[0].orgId).toBe(org.id);
  });
});

describe("createEnrollment — defensas", () => {
  it("un studentId ajeno corta ANTES de escribir: ninguna org queda tocada", async () => {
    freezeClock();
    const { org, group } = await makeBase();
    const other = await makeOrg("Estudio B");
    const foreignStudent = await makeStudent(other.id, "Malena Ríos");

    await expect(
      createEnrollment(org.id, {
        studentId: foreignStudent.id,
        groupId: group.id,
        plan: "MONTHLY",
        price: 18000,
        startDate: "2026-07-15",
      }),
    ).rejects.toThrow(/alumno no pertenece/);

    expect(await db.enrollment.count()).toBe(0);
    expect(await db.charge.count()).toBe(0);
  });

  it("un groupId ajeno corta ANTES de escribir", async () => {
    freezeClock();
    const { org, student } = await makeBase();
    const other = await makeOrg("Estudio B");
    const foreignGroup = await makeGroup(other.id, "Folklore adultos");

    await expect(
      createEnrollment(org.id, {
        studentId: student.id,
        groupId: foreignGroup.id,
        plan: "MONTHLY",
        price: 18000,
        startDate: "2026-07-15",
      }),
    ).rejects.toThrow(/grupo no pertenece/);

    expect(await db.enrollment.count()).toBe(0);
  });

  it("dos inscripciones ABIERTAS al mismo grupo no se puede; cerrada y volver, sí (RN9)", async () => {
    freezeClock();
    const { org, student, group } = await makeBase();

    const input = {
      studentId: student.id,
      groupId: group.id,
      plan: "MONTHLY" as const,
      price: 18000,
      startDate: "2026-07-01",
    };

    const first = await createEnrollment(org.id, input);
    await expect(createEnrollment(org.id, input)).rejects.toThrow(EnrollmentRuleError);
    expect(await db.enrollment.count()).toBe(1);

    // Se fue y volvió: baja a la primera, y la nueva inscripción entra.
    await endEnrollment(org.id, first.id, "2026-07-10");
    await createEnrollment(org.id, { ...input, startDate: "2026-07-20" });
    expect(await db.enrollment.count()).toBe(2);
  });
});

describe("endEnrollment — baja (RN9)", () => {
  it("pone endDate y las cuotas ya generadas PERSISTEN", async () => {
    freezeClock();
    const { org, student, group } = await makeBase();
    const { id } = await createEnrollment(org.id, {
      studentId: student.id,
      groupId: group.id,
      plan: "MONTHLY",
      price: 18000,
      startDate: "2026-07-01",
    });

    await endEnrollment(org.id, id, "2026-07-20");

    const after = await db.enrollment.findUniqueOrThrow({ where: { id } });
    expect(after.endDate?.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(await db.charge.count({ where: { enrollmentId: id } })).toBe(1);
  });

  it("la baja no puede ser anterior al alta", async () => {
    freezeClock();
    const { org, student, group } = await makeBase();
    const enrollment = await makeEnrollment(org.id, student.id, group.id, {
      startDate: "2026-07-10",
    });

    await expect(endEnrollment(org.id, enrollment.id, "2026-07-05")).rejects.toThrow(
      EnrollmentRuleError,
    );
  });

  it("una inscripción ajena no se puede dar de baja", async () => {
    const { org } = await makeBase();
    const other = await makeOrg("Estudio B");
    const student = await makeStudent(other.id, "Malena Ríos");
    const group = await makeGroup(other.id, "Folklore adultos");
    const foreign = await makeEnrollment(other.id, student.id, group.id);

    await expect(endEnrollment(org.id, foreign.id, "2026-07-20")).rejects.toThrow(/no pertenece/);

    const after = await db.enrollment.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(after.endDate).toBeNull();
  });
});

describe("lecturas", () => {
  it("listEnrollmentsForStudent: abiertas primero, precio como number, con su grupo", async () => {
    const { org, student, group } = await makeBase();
    const other = await makeGroup(org.id, "Folklore adultos");
    await makeEnrollment(org.id, student.id, group.id, {
      startDate: "2026-01-05",
      endDate: "2026-05-31",
    });
    await makeEnrollment(org.id, student.id, other.id, { startDate: "2026-06-01" });

    const list = await listEnrollmentsForStudent(org.id, student.id);

    expect(list).toHaveLength(2);
    expect(list[0].group.name).toBe("Folklore adultos"); // la abierta primero
    expect(list[0].endDate).toBeNull();
    expect(list[0].price).toBe(18000);
    expect(list[1].endDate).toBe("2026-05-31");
  });

  it("listActiveEnrollmentsForGroup: la baja pasada no aparece; la futura y la abierta sí", async () => {
    const { org, student, group } = await makeBase();
    const past = await makeStudent(org.id, "Antigua Alumna");
    const leaving = await makeStudent(org.id, "Baja Próxima");
    await makeEnrollment(org.id, student.id, group.id); // abierta
    await makeEnrollment(org.id, past.id, group.id, { endDate: "2026-07-10" });
    await makeEnrollment(org.id, leaving.id, group.id, { endDate: "2026-07-25" });

    const list = await listActiveEnrollmentsForGroup(org.id, group.id, "2026-07-20");

    expect(list.map((e) => e.student.name)).toEqual(["Baja Próxima", "Sofía Herrera"]);
  });
});
