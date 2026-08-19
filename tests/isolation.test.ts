import { describe, expect, it } from "vitest";

import { listMembershipsForUser, resolveActiveOrg } from "@/lib/active-org";
import { db, withOrg } from "@/lib/db";

import {
  makeAllocation,
  makeCharge,
  makeDiscipline,
  makeEnrollment,
  makeGroup,
  makeInvitation,
  makeMember,
  makeOrg,
  makePayment,
  makeReminderLog,
  makeSession,
  makeSlot,
  makeSpace,
  makeStudent,
  makeTeacherProfile,
} from "./factories";

/**
 * El corazón de F0.6: un cliente `withOrg(A)` no puede leer NI escribir datos de la org B.
 * Corre contra Postgres real (nada de mockear Prisma): es la única forma de probar que el
 * aislamiento pasa por la base y no por buena voluntad.
 */

describe("aislamiento org × org — Discipline (lecturas)", () => {
  it("A no ve las disciplinas de B; solo las propias", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    await makeDiscipline(a.id, "Árabe");
    await makeDiscipline(b.id, "Folklore");

    const seenByA = await withOrg(a.id).discipline.findMany();
    expect(seenByA.map((d) => d.name)).toEqual(["Árabe"]);
  });

  it("findUnique por el id de una disciplina de B, desde A, devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bDiscipline = await makeDiscipline(b.id, "Folklore");

    const found = await withOrg(a.id).discipline.findUnique({
      where: { id: bDiscipline.id },
    });
    expect(found).toBeNull();
  });

  it("count desde A no cuenta lo de B", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    await makeDiscipline(a.id, "Árabe");
    await makeDiscipline(b.id, "Folklore");
    await makeDiscipline(b.id, "Canto");

    expect(await withOrg(a.id).discipline.count()).toBe(1);
  });
});

describe("aislamiento org × org — Discipline (escrituras)", () => {
  it("A no puede actualizar una disciplina de B por id (P2025)", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bDiscipline = await makeDiscipline(b.id, "Folklore");

    await expect(
      withOrg(a.id).discipline.update({
        where: { id: bDiscipline.id },
        data: { name: "Hackeada" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    // B quedó intacta.
    const after = await db.discipline.findUniqueOrThrow({ where: { id: bDiscipline.id } });
    expect(after.name).toBe("Folklore");
  });

  it("un updateMany desde A no toca las filas de B", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    await makeDiscipline(a.id, "Árabe");
    const bDiscipline = await makeDiscipline(b.id, "Folklore");

    const result = await withOrg(a.id).discipline.updateMany({ data: { name: "Renombrada" } });
    expect(result.count).toBe(1); // solo la de A

    const bAfter = await db.discipline.findUniqueOrThrow({ where: { id: bDiscipline.id } });
    expect(bAfter.name).toBe("Folklore");
  });

  it("A no puede borrar una disciplina de B por id (P2025); deleteMany tampoco la alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bDiscipline = await makeDiscipline(b.id, "Folklore");

    await expect(
      withOrg(a.id).discipline.delete({ where: { id: bDiscipline.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).discipline.deleteMany({}); // "borrá todo lo mío" — no toca a B
    expect(await db.discipline.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("una escritura vía withOrg(A) no puede aterrizar en B: el orgId se fuerza al de A", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");

    // Aunque se pase el orgId de B, el hook lo pisa con el de A.
    const created = await withOrg(a.id).discipline.create({
      data: { name: "Contemporáneo", orgId: b.id },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.discipline.count({ where: { orgId: b.id } })).toBe(0);
  });

  it("un upsert que no matchea cae al create, y el create también queda en A", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bDiscipline = await makeDiscipline(b.id, "Folklore");

    // upsert apuntando al id de B desde A: el where inyecta orgId=A → no matchea → CREATE.
    const result = await withOrg(a.id).discipline.upsert({
      where: { id: bDiscipline.id },
      create: { name: "Nueva", orgId: b.id },
      update: { name: "No debería pasar" },
    });

    expect(result.orgId).toBe(a.id);
    // La de B quedó igual: ni se actualizó ni se duplicó en B.
    const bAfter = await db.discipline.findUniqueOrThrow({ where: { id: bDiscipline.id } });
    expect(bAfter.name).toBe("Folklore");
    expect(await db.discipline.count({ where: { orgId: b.id } })).toBe(1);
  });
});

/**
 * Student es el primer modelo de negocio de la Fase 1. Estos casos son el PATRÓN: todo
 * modelo nuevo entra a `SCOPE` en withOrg y trae su bloque de aislamiento acá. No es
 * opcional.
 */
describe("aislamiento org × org — Student", () => {
  it("A no ve los alumnos de B; solo los propios", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    await makeStudent(a.id, "Sofía Herrera");
    await makeStudent(b.id, "Malena Ríos");

    const seenByA = await withOrg(a.id).student.findMany();
    expect(seenByA.map((s) => s.name)).toEqual(["Sofía Herrera"]);
  });

  it("findUnique por el id de un alumno de B, desde A, devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bStudent = await makeStudent(b.id, "Malena Ríos");

    expect(await withOrg(a.id).student.findUnique({ where: { id: bStudent.id } })).toBeNull();
  });

  it("A no puede editar un alumno de B (P2025), ni darlo de baja", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bStudent = await makeStudent(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).student.update({
        where: { id: bStudent.id },
        data: { name: "Hackeada" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    // La baja lógica es un update: tampoco alcanza a B.
    await expect(
      withOrg(a.id).student.update({
        where: { id: bStudent.id },
        data: { active: false },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.student.findUniqueOrThrow({ where: { id: bStudent.id } });
    expect(after.name).toBe("Malena Ríos");
    expect(after.active).toBe(true);
  });

  it("A no puede borrar un alumno de B; un deleteMany desde A no lo alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bStudent = await makeStudent(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).student.delete({ where: { id: bStudent.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).student.deleteMany({}); // "borrá todos los míos"
    expect(await db.student.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("un alumno creado vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");

    const created = await withOrg(a.id).student.create({
      data: { name: "Iñaki Pérez", searchName: "inaki perez", orgId: b.id },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.student.count({ where: { orgId: b.id } })).toBe(0);
  });
});

/** S2: los tres modelos de la agenda, con el mismo bloque que Student. */
describe("aislamiento org × org — ClassGroup", () => {
  it("A no ve los grupos de B; solo los propios", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    await makeGroup(a.id, "Árabe inicial");
    await makeGroup(b.id, "Folklore adultos");

    const seenByA = await withOrg(a.id).classGroup.findMany();
    expect(seenByA.map((g) => g.name)).toEqual(["Árabe inicial"]);
  });

  it("findUnique por el id de un grupo de B, desde A, devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "Folklore adultos");

    expect(await withOrg(a.id).classGroup.findUnique({ where: { id: bGroup.id } })).toBeNull();
  });

  it("A no puede editar un grupo de B (P2025), ni desactivarlo", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "Folklore adultos");

    await expect(
      withOrg(a.id).classGroup.update({
        where: { id: bGroup.id },
        data: { name: "Hackeado" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    await expect(
      withOrg(a.id).classGroup.update({
        where: { id: bGroup.id },
        data: { active: false },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.classGroup.findUniqueOrThrow({ where: { id: bGroup.id } });
    expect(after.name).toBe("Folklore adultos");
    expect(after.active).toBe(true);
  });

  it("A no puede borrar un grupo de B; un deleteMany desde A no lo alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "Folklore adultos");

    await expect(
      withOrg(a.id).classGroup.delete({ where: { id: bGroup.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).classGroup.deleteMany({});
    expect(await db.classGroup.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("un grupo creado vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aDiscipline = await makeDiscipline(a.id, "Árabe");

    const created = await withOrg(a.id).classGroup.create({
      data: {
        name: "Canto grupal",
        disciplineId: aDiscipline.id,
        defaultPrice: 20000,
        orgId: b.id,
      },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.classGroup.count({ where: { orgId: b.id } })).toBe(0);
  });
});

describe("aislamiento org × org — ScheduleSlot", () => {
  it("A no ve las franjas de B; solo las propias", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aGroup = await makeGroup(a.id, "Árabe inicial");
    const bGroup = await makeGroup(b.id, "Folklore adultos");
    await makeSlot(a.id, aGroup.id, { startTime: "18:00" });
    await makeSlot(b.id, bGroup.id, { startTime: "10:00" });

    const seenByA = await withOrg(a.id).scheduleSlot.findMany();
    expect(seenByA.map((s) => s.startTime)).toEqual(["18:00"]);
  });

  it("findUnique por el id de una franja de B, desde A, devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "Folklore adultos");
    const bSlot = await makeSlot(b.id, bGroup.id);

    expect(await withOrg(a.id).scheduleSlot.findUnique({ where: { id: bSlot.id } })).toBeNull();
  });

  it("A no puede editar una franja de B (P2025)", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "Folklore adultos");
    const bSlot = await makeSlot(b.id, bGroup.id, { startTime: "10:00" });

    await expect(
      withOrg(a.id).scheduleSlot.update({
        where: { id: bSlot.id },
        data: { startTime: "03:00" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.scheduleSlot.findUniqueOrThrow({ where: { id: bSlot.id } });
    expect(after.startTime).toBe("10:00");
  });

  it("A no puede borrar una franja de B; un deleteMany desde A no la alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "Folklore adultos");
    const bSlot = await makeSlot(b.id, bGroup.id);

    await expect(
      withOrg(a.id).scheduleSlot.delete({ where: { id: bSlot.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).scheduleSlot.deleteMany({});
    expect(await db.scheduleSlot.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("una franja creada vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aGroup = await makeGroup(a.id, "Árabe inicial");

    const created = await withOrg(a.id).scheduleSlot.create({
      data: { groupId: aGroup.id, weekday: 2, startTime: "19:00", durationMin: 60, orgId: b.id },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.scheduleSlot.count({ where: { orgId: b.id } })).toBe(0);
  });
});

describe("aislamiento org × org — ClassSession", () => {
  it("A no ve las excepciones de B; solo las propias", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aGroup = await makeGroup(a.id, "Árabe inicial");
    const aSlot = await makeSlot(a.id, aGroup.id);
    const bGroup = await makeGroup(b.id, "Folklore adultos");
    const bSlot = await makeSlot(b.id, bGroup.id);
    await makeSession(a.id, aGroup.id, aSlot.id, "2026-07-14");
    await makeSession(b.id, bGroup.id, bSlot.id, "2026-07-14");

    const seenByA = await withOrg(a.id).classSession.findMany();
    expect(seenByA.map((s) => s.orgId)).toEqual([a.id]);
  });

  it("findUnique por el id de una excepción de B, desde A, devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "Folklore adultos");
    const bSlot = await makeSlot(b.id, bGroup.id);
    const bSession = await makeSession(b.id, bGroup.id, bSlot.id, "2026-07-14");

    expect(await withOrg(a.id).classSession.findUnique({ where: { id: bSession.id } })).toBeNull();
  });

  it("A no puede editar una excepción de B (P2025)", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "Folklore adultos");
    const bSlot = await makeSlot(b.id, bGroup.id);
    const bSession = await makeSession(b.id, bGroup.id, bSlot.id, "2026-07-14");

    await expect(
      withOrg(a.id).classSession.update({
        where: { id: bSession.id },
        data: { status: "SCHEDULED" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.classSession.findUniqueOrThrow({ where: { id: bSession.id } });
    expect(after.status).toBe("CANCELLED");
  });

  it("A no puede borrar una excepción de B; un deleteMany desde A no la alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "Folklore adultos");
    const bSlot = await makeSlot(b.id, bGroup.id);
    const bSession = await makeSession(b.id, bGroup.id, bSlot.id, "2026-07-14");

    await expect(
      withOrg(a.id).classSession.delete({ where: { id: bSession.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).classSession.deleteMany({});
    expect(await db.classSession.count({ where: { id: bSession.id } })).toBe(1);
  });

  it("una excepción creada vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aGroup = await makeGroup(a.id, "Árabe inicial");
    const aSlot = await makeSlot(a.id, aGroup.id);

    const created = await withOrg(a.id).classSession.create({
      data: {
        groupId: aGroup.id,
        slotId: aSlot.id,
        date: new Date("2026-07-14T00:00:00.000Z"),
        status: "CANCELLED",
        orgId: b.id,
      },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.classSession.count({ where: { orgId: b.id } })).toBe(0);
  });

  it("un upsert sobre la ocurrencia de B no la toca: cae al create y queda en A", async () => {
    // CRÍTICO: cancelar una sesión ES un upsert por (slotId, date). Si el upsert de A
    // matcheara la fila de B, "cancelar" cruzaría tenants.
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aGroup = await makeGroup(a.id, "Árabe inicial");
    const aSlot = await makeSlot(a.id, aGroup.id);
    const bGroup = await makeGroup(b.id, "Folklore adultos");
    const bSlot = await makeSlot(b.id, bGroup.id);
    const bSession = await makeSession(b.id, bGroup.id, bSlot.id, "2026-07-14", {
      status: "SCHEDULED",
      note: "Nota de B",
    });

    // Mismo (slotId, date) que la fila de B: el where inyecta orgId=A → no matchea → CREATE
    // (con los datos de A: el hook además pisa el orgId del create).
    const result = await withOrg(a.id).classSession.upsert({
      where: { slotId_date: { slotId: bSlot.id, date: new Date("2026-07-14T00:00:00.000Z") } },
      create: {
        groupId: aGroup.id,
        slotId: aSlot.id,
        date: new Date("2026-07-14T00:00:00.000Z"),
        status: "CANCELLED",
        orgId: b.id, // el hook también pisa esto
      },
      update: { status: "CANCELLED", note: "No debería pasar" },
    });

    expect(result.orgId).toBe(a.id);
    // La de B quedó exactamente igual: ni cancelada ni anotada.
    const bAfter = await db.classSession.findUniqueOrThrow({ where: { id: bSession.id } });
    expect(bAfter.status).toBe("SCHEDULED");
    expect(bAfter.note).toBe("Nota de B");
  });
});

/**
 * S3: los dos modelos de cobranzas, con el mismo bloque que Student. Acá el aislamiento
 * es PLATA: una cuota de la org A visible o mutable desde la org B destruye la confianza
 * (Plan §13) — el rigor de F0.6 aplica entero.
 */
describe("aislamiento org × org — Enrollment", () => {
  /** Un alumno inscripto a un grupo, todo dentro de la misma org. */
  async function makeEnrolled(orgId: string, studentName: string) {
    const student = await makeStudent(orgId, studentName);
    const group = await makeGroup(orgId, `Grupo de ${studentName}`);
    return makeEnrollment(orgId, student.id, group.id);
  }

  it("A no ve las inscripciones de B; solo las propias", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aEnrollment = await makeEnrolled(a.id, "Sofía Herrera");
    await makeEnrolled(b.id, "Malena Ríos");

    const seenByA = await withOrg(a.id).enrollment.findMany();
    expect(seenByA.map((e) => e.id)).toEqual([aEnrollment.id]);
  });

  it("findUnique por el id de una inscripción de B, desde A, devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bEnrollment = await makeEnrolled(b.id, "Malena Ríos");

    expect(await withOrg(a.id).enrollment.findUnique({ where: { id: bEnrollment.id } })).toBeNull();
  });

  it("A no puede editar una inscripción de B (P2025), ni darla de baja con endDate", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bEnrollment = await makeEnrolled(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).enrollment.update({
        where: { id: bEnrollment.id },
        data: { price: 1 },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    // La baja (RN9) es un update de endDate: tampoco alcanza a B.
    await expect(
      withOrg(a.id).enrollment.update({
        where: { id: bEnrollment.id },
        data: { endDate: new Date("2026-07-31T00:00:00.000Z") },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.enrollment.findUniqueOrThrow({ where: { id: bEnrollment.id } });
    expect(after.price.toNumber()).toBe(18000);
    expect(after.endDate).toBeNull();
  });

  it("A no puede borrar una inscripción de B; un deleteMany desde A no la alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bEnrollment = await makeEnrolled(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).enrollment.delete({ where: { id: bEnrollment.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).enrollment.deleteMany({});
    expect(await db.enrollment.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("una inscripción creada vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aStudent = await makeStudent(a.id, "Sofía Herrera");
    const aGroup = await makeGroup(a.id, "Árabe inicial");

    const created = await withOrg(a.id).enrollment.create({
      data: {
        studentId: aStudent.id,
        groupId: aGroup.id,
        plan: "MONTHLY",
        price: 18000,
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        orgId: b.id,
      },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.enrollment.count({ where: { orgId: b.id } })).toBe(0);
  });
});

describe("aislamiento org × org — Charge", () => {
  /** Alumno + grupo + inscripción + cuota, todo dentro de la misma org. */
  async function makeCharged(orgId: string, studentName: string) {
    const student = await makeStudent(orgId, studentName);
    const group = await makeGroup(orgId, `Grupo de ${studentName}`);
    const enrollment = await makeEnrollment(orgId, student.id, group.id);
    return { enrollment, charge: await makeCharge(orgId, enrollment.id) };
  }

  it("A no ve las cuotas de B; solo las propias", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { charge: aCharge } = await makeCharged(a.id, "Sofía Herrera");
    await makeCharged(b.id, "Malena Ríos");

    const seenByA = await withOrg(a.id).charge.findMany();
    expect(seenByA.map((c) => c.id)).toEqual([aCharge.id]);
  });

  it("findUnique por el id de una cuota de B, desde A, devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { charge: bCharge } = await makeCharged(b.id, "Malena Ríos");

    expect(await withOrg(a.id).charge.findUnique({ where: { id: bCharge.id } })).toBeNull();
  });

  it("A no puede editar el monto ni exonerar una cuota de B (P2025)", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { charge: bCharge } = await makeCharged(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).charge.update({
        where: { id: bCharge.id },
        data: { amount: 1 },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    await expect(
      withOrg(a.id).charge.update({
        where: { id: bCharge.id },
        data: { status: "WAIVED" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.charge.findUniqueOrThrow({ where: { id: bCharge.id } });
    expect(after.amount.toNumber()).toBe(18000);
    expect(after.status).toBe("PENDING");
  });

  it("A no puede borrar una cuota de B; un deleteMany desde A no la alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { charge: bCharge } = await makeCharged(b.id, "Malena Ríos");

    await expect(withOrg(a.id).charge.delete({ where: { id: bCharge.id } })).rejects.toMatchObject({
      code: "P2025",
    });

    await withOrg(a.id).charge.deleteMany({});
    expect(await db.charge.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("una cuota creada vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { enrollment: aEnrollment } = await makeCharged(a.id, "Sofía Herrera");

    const created = await withOrg(a.id).charge.create({
      data: {
        enrollmentId: aEnrollment.id,
        period: "2026-08",
        amount: 18000,
        currency: "ARS",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        orgId: b.id,
      },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.charge.count({ where: { orgId: b.id } })).toBe(0);
  });

  it("un upsert sobre la cuota de B no la toca: cae al create y queda en A", async () => {
    // CRÍTICO: generar cuotas ES un upsert por (enrollmentId, period). Si el upsert de A
    // matcheara la fila de B, el cron cruzaría deuda entre tenants.
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { enrollment: aEnrollment } = await makeCharged(a.id, "Sofía Herrera");
    const { enrollment: bEnrollment, charge: bCharge } = await makeCharged(b.id, "Malena Ríos");

    // Mismo (enrollmentId, period) que la fila de B: el where inyecta orgId=A → no
    // matchea → CREATE (y el hook pisa el orgId del create). El create apunta a la
    // inscripción de A: un FK a la de B violaría además la verificación previa del
    // servicio — acá se prueba solo la capa withOrg.
    const result = await withOrg(a.id).charge.upsert({
      where: { enrollmentId_period: { enrollmentId: bEnrollment.id, period: "2026-07" } },
      create: {
        enrollmentId: aEnrollment.id,
        period: "2026-08",
        amount: 999,
        currency: "ARS",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        orgId: b.id, // el hook también pisa esto
      },
      update: { amount: 999, status: "WAIVED" },
    });

    expect(result.orgId).toBe(a.id);
    // La de B quedó exactamente igual: ni el monto ni el estado se movieron.
    const bAfter = await db.charge.findUniqueOrThrow({ where: { id: bCharge.id } });
    expect(bAfter.amount.toNumber()).toBe(18000);
    expect(bAfter.status).toBe("PENDING");
  });
});

/**
 * S4: pagos e imputaciones. Acá el aislamiento es PLATA REGISTRADA: un pago de la org A
 * visible, editable o borrable desde la B rompería el estado de cuenta de las dos.
 */
describe("aislamiento org × org — Payment", () => {
  async function makePaid(orgId: string, studentName: string) {
    const student = await makeStudent(orgId, studentName);
    return { student, payment: await makePayment(orgId, student.id) };
  }

  it("A no ve los pagos de B; solo los propios", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { payment: aPayment } = await makePaid(a.id, "Sofía Herrera");
    await makePaid(b.id, "Malena Ríos");

    const seenByA = await withOrg(a.id).payment.findMany();
    expect(seenByA.map((p) => p.id)).toEqual([aPayment.id]);
  });

  it("findUnique por id ajeno devuelve null; por receiptToken ajeno, también", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { payment: bPayment } = await makePaid(b.id, "Malena Ríos");

    expect(await withOrg(a.id).payment.findUnique({ where: { id: bPayment.id } })).toBeNull();
    expect(
      await withOrg(a.id).payment.findUnique({
        where: { receiptToken: bPayment.receiptToken },
      }),
    ).toBeNull();
  });

  it("A no puede editar un pago de B (P2025), ni cambiarle el adjunto", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { payment: bPayment } = await makePaid(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).payment.update({ where: { id: bPayment.id }, data: { amount: 1 } }),
    ).rejects.toMatchObject({ code: "P2025" });

    // El adjunto es un pointer a R2: pisárselo a otra org sería robarle el comprobante.
    await expect(
      withOrg(a.id).payment.update({
        where: { id: bPayment.id },
        data: { attachmentKey: "hackeada/payments/x" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.payment.findUniqueOrThrow({ where: { id: bPayment.id } });
    expect(after.amount.toNumber()).toBe(18000);
    expect(after.attachmentKey).toBeNull();
  });

  it("A no puede borrar un pago de B; un deleteMany desde A no lo alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { payment: bPayment } = await makePaid(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).payment.delete({ where: { id: bPayment.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).payment.deleteMany({});
    expect(await db.payment.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("un pago creado vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aStudent = await makeStudent(a.id, "Sofía Herrera");

    const created = await withOrg(a.id).payment.create({
      data: {
        studentId: aStudent.id,
        amount: 18000,
        currency: "ARS",
        method: "CASH",
        paidAt: new Date("2026-07-05T00:00:00.000Z"),
        receiptToken: "token-aislamiento-a",
        orgId: b.id,
      },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.payment.count({ where: { orgId: b.id } })).toBe(0);
  });
});

describe("aislamiento org × org — PaymentAllocation", () => {
  /** Alumno + grupo + inscripción + cuota + pago + imputación, todo en la misma org. */
  async function makeAllocated(orgId: string, studentName: string) {
    const student = await makeStudent(orgId, studentName);
    const group = await makeGroup(orgId, `Grupo de ${studentName}`);
    const enrollment = await makeEnrollment(orgId, student.id, group.id);
    const charge = await makeCharge(orgId, enrollment.id);
    const payment = await makePayment(orgId, student.id);
    const allocation = await makeAllocation(orgId, payment.id, charge.id);
    return { student, charge, payment, allocation };
  }

  it("A no ve las imputaciones de B; solo las propias", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { allocation: aAllocation } = await makeAllocated(a.id, "Sofía Herrera");
    await makeAllocated(b.id, "Malena Ríos");

    const seenByA = await withOrg(a.id).paymentAllocation.findMany();
    expect(seenByA.map((al) => al.paymentId)).toEqual([aAllocation.paymentId]);
  });

  it("A no puede editar ni borrar una imputación de B (P2025 / deleteMany no alcanza)", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { allocation: bAllocation } = await makeAllocated(b.id, "Malena Ríos");
    const key = {
      paymentId_chargeId: {
        paymentId: bAllocation.paymentId,
        chargeId: bAllocation.chargeId,
      },
    };

    await expect(
      withOrg(a.id).paymentAllocation.update({ where: key, data: { amount: 1 } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).paymentAllocation.deleteMany({});
    expect(await db.paymentAllocation.count({ where: { orgId: b.id } })).toBe(1);

    const after = await db.paymentAllocation.findUniqueOrThrow({ where: key });
    expect(after.amount.toNumber()).toBe(18000);
  });

  it("una imputación creada vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { payment, charge } = await makeAllocated(a.id, "Sofía Herrera");
    // Otra cuota de A para no chocar con la PK de la imputación ya creada.
    const student2 = await makeStudent(a.id, "Iñaki Gómez");
    const group2 = await makeGroup(a.id, "Otro grupo");
    const enrollment2 = await makeEnrollment(a.id, student2.id, group2.id);
    const charge2 = await makeCharge(a.id, enrollment2.id, { period: "2026-08" });
    void charge;

    const created = await withOrg(a.id).paymentAllocation.create({
      data: { paymentId: payment.id, chargeId: charge2.id, amount: 5000, orgId: b.id },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.paymentAllocation.count({ where: { orgId: b.id } })).toBe(0);
  });
});

describe("aislamiento org × org — Membership", () => {
  it("A solo ve sus propias membresías", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const memberA = await makeMember(a.id, "OWNER");
    await makeMember(b.id, "OWNER");

    const seen = await withOrg(a.id).membership.findMany();
    expect(seen.map((m) => m.userId)).toEqual([memberA.userId]);
  });

  it("sin membresía en la org, el lookup por clave devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const outsider = await makeMember(a.id, "TEACHER"); // miembro de A, no de B

    const found = await withOrg(b.id).membership.findUnique({
      where: { userId_orgId: { userId: outsider.userId, orgId: b.id } },
      select: { role: true },
    });
    expect(found).toBeNull();
  });
});

describe("aislamiento org × org — ReminderLog", () => {
  async function makeReminded(orgId: string, studentName: string) {
    const student = await makeStudent(orgId, studentName);
    return { student, reminder: await makeReminderLog(orgId, student.id) };
  }

  it("A no ve los recordatorios de B; findUnique por id ajeno devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { reminder: aReminder } = await makeReminded(a.id, "Sofía Herrera");
    const { reminder: bReminder } = await makeReminded(b.id, "Malena Ríos");

    const seenByA = await withOrg(a.id).reminderLog.findMany();
    expect(seenByA.map((r) => r.id)).toEqual([aReminder.id]);
    expect(await withOrg(a.id).reminderLog.findUnique({ where: { id: bReminder.id } })).toBeNull();
  });

  it("A no puede editar un recordatorio de B (P2025)", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { reminder: bReminder } = await makeReminded(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).reminderLog.update({
        where: { id: bReminder.id },
        data: { channel: "EMAIL" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.reminderLog.findUniqueOrThrow({ where: { id: bReminder.id } });
    expect(after.channel).toBe("WHATSAPP_LINK");
  });

  it("A no puede borrar un recordatorio de B; un deleteMany desde A no lo alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { reminder: bReminder } = await makeReminded(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).reminderLog.delete({ where: { id: bReminder.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).reminderLog.deleteMany({});
    expect(await db.reminderLog.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("un recordatorio creado vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aStudent = await makeStudent(a.id, "Sofía Herrera");

    const created = await withOrg(a.id).reminderLog.create({
      data: {
        studentId: aStudent.id,
        channel: "WHATSAPP_LINK",
        sentAt: new Date("2026-07-10T15:00:00.000Z"),
        orgId: b.id,
      },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.reminderLog.count({ where: { orgId: b.id } })).toBe(0);
  });

  it("el historial de la ficha queda scoped: A solo lista recordatorios de su alumno", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const { student: aStudent, reminder: aReminder } = await makeReminded(a.id, "Sofía Herrera");
    // El caso ADVERSARIAL de verdad: una fila con orgId=B que apunta al alumno DE A
    // (posible vía db crudo: el FK no distingue tenants). La query de la ficha filtra
    // por studentId — si withOrg no inyectara el orgId, esta fila se colaría.
    await makeReminderLog(b.id, aStudent.id);

    const history = await withOrg(a.id).reminderLog.findMany({
      where: { studentId: aStudent.id },
      orderBy: { sentAt: "desc" },
    });
    expect(history.map((r) => r.id)).toEqual([aReminder.id]);
  });
});

describe("cambio de organización activa (selector, S7 adelantado)", () => {
  it("listMembershipsForUser trae SOLO las membresías propias, en orden de antigüedad", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const member = await makeMember(a.id, "OWNER");
    // Otro usuario en B: no debe aparecer en la lista del primero.
    await makeMember(b.id, "OWNER");

    const memberships = await listMembershipsForUser(member.userId);
    expect(memberships.map((m) => m.orgId)).toEqual([a.id]);
    expect(memberships[0].role).toBe("OWNER");
    expect(memberships[0].orgName).toBe("Estudio A");
  });

  it("imposible activar una org sin membresía: la preferencia forjada cae a la propia", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const member = await makeMember(a.id, "TEACHER");
    await makeMember(b.id, "OWNER"); // B existe y tiene gente — pero no este usuario.

    const memberships = await listMembershipsForUser(member.userId);
    const orgIds = memberships.map((m) => m.orgId);
    // La cookie del selector es input del cliente: apuntando a B, se ignora.
    expect(resolveActiveOrg(orgIds, b.id)).toBe(a.id);
    // Y con las dos membresías reales, la preferencia sí manda.
    const dual = await db.membership.create({
      data: { userId: member.userId, orgId: b.id, role: "TEACHER" },
    });
    const dualIds = (await listMembershipsForUser(dual.userId)).map((m) => m.orgId);
    expect(resolveActiveOrg(dualIds, b.id)).toBe(b.id);
  });
});

/** S7: el equipo entra al aislamiento con el mismo bloque que Student. */
describe("aislamiento org × org — TeacherProfile", () => {
  it("A no ve los perfiles de B; solo los propios", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    await makeTeacherProfile(a.id, "Caro Suárez");
    await makeTeacherProfile(b.id, "Malena Ríos");

    const seenByA = await withOrg(a.id).teacherProfile.findMany();
    expect(seenByA.map((p) => p.displayName)).toEqual(["Caro Suárez"]);
  });

  it("findUnique por el id de un perfil de B, desde A, devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bProfile = await makeTeacherProfile(b.id, "Malena Ríos");

    expect(
      await withOrg(a.id).teacherProfile.findUnique({ where: { id: bProfile.id } }),
    ).toBeNull();
  });

  it("A no puede editar ni desvincular un perfil de B (P2025)", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bUser = await makeMember(b.id, "TEACHER");
    const bProfile = await makeTeacherProfile(b.id, "Malena Ríos", {
      membershipUserId: bUser.userId,
    });

    await expect(
      withOrg(a.id).teacherProfile.update({
        where: { id: bProfile.id },
        data: { displayName: "Hackeada" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    // Desvincular (la revocación) tampoco alcanza a B.
    await expect(
      withOrg(a.id).teacherProfile.update({
        where: { id: bProfile.id },
        data: { membershipUserId: null },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.teacherProfile.findUniqueOrThrow({ where: { id: bProfile.id } });
    expect(after.displayName).toBe("Malena Ríos");
    expect(after.membershipUserId).toBe(bUser.userId);
  });

  it("A no puede borrar un perfil de B; un deleteMany desde A no lo alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bProfile = await makeTeacherProfile(b.id, "Malena Ríos");

    await expect(
      withOrg(a.id).teacherProfile.delete({ where: { id: bProfile.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).teacherProfile.deleteMany({});
    expect(await db.teacherProfile.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("un perfil creado vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");

    const created = await withOrg(a.id).teacherProfile.create({
      data: { displayName: "Caro Suárez", kind: "STAFF", orgId: b.id },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.teacherProfile.count({ where: { orgId: b.id } })).toBe(0);
  });
});

describe("aislamiento org × org — Invitation", () => {
  it("A no ve las invitaciones de B; solo las propias", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    await makeInvitation(a.id, { email: "propia@test.local" });
    await makeInvitation(b.id, { email: "ajena@test.local" });

    const seenByA = await withOrg(a.id).invitation.findMany();
    expect(seenByA.map((i) => i.email)).toEqual(["propia@test.local"]);
  });

  it("el token de B, buscado desde A, devuelve null — la llave no cruza tenants", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bInvitation = await makeInvitation(b.id);

    // El unique global encuentra la fila; el orgId inyectado la descarta. Este es el
    // caso que hace imposible "usar en B una invitación de A" (la aceptación relee el
    // token vía withOrg de la org que dice el propio token — ver team.test.ts).
    expect(
      await withOrg(a.id).invitation.findUnique({ where: { token: bInvitation.token } }),
    ).toBeNull();
  });

  it("A no puede marcar usada ni regenerar una invitación de B (P2025)", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bInvitation = await makeInvitation(b.id);

    await expect(
      withOrg(a.id).invitation.update({
        where: { id: bInvitation.id },
        data: { usedAt: new Date() },
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.invitation.findUniqueOrThrow({ where: { id: bInvitation.id } });
    expect(after.usedAt).toBeNull();
  });

  it("A no puede revocar (borrar) una invitación de B; un deleteMany no la alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bInvitation = await makeInvitation(b.id);

    await expect(
      withOrg(a.id).invitation.delete({ where: { id: bInvitation.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).invitation.deleteMany({});
    expect(await db.invitation.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("una invitación creada vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");

    const created = await withOrg(a.id).invitation.create({
      data: {
        role: "TEACHER",
        token: "token-de-prueba-aterrizaje",
        expiresAt: new Date(Date.now() + 1000 * 60),
        orgId: b.id,
      },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.invitation.count({ where: { orgId: b.id } })).toBe(0);
  });
});

/** S8: los salones entran al aislamiento con el mismo bloque que Student. */
describe("aislamiento org × org — Space", () => {
  it("A no ve los salones de B; solo los propios", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    await makeSpace(a.id, "Salón propio");
    await makeSpace(b.id, "Salón ajeno");

    const seenByA = await withOrg(a.id).space.findMany();
    expect(seenByA.map((s) => s.name)).toEqual(["Salón propio"]);
  });

  it("findUnique por el id de un salón de B, desde A, devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bSpace = await makeSpace(b.id, "Salón ajeno");

    expect(await withOrg(a.id).space.findUnique({ where: { id: bSpace.id } })).toBeNull();
  });

  it("A no puede renombrar ni desactivar un salón de B (P2025)", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bSpace = await makeSpace(b.id, "Salón ajeno");

    await expect(
      withOrg(a.id).space.update({ where: { id: bSpace.id }, data: { name: "Hackeado" } }),
    ).rejects.toMatchObject({ code: "P2025" });
    await expect(
      withOrg(a.id).space.update({ where: { id: bSpace.id }, data: { active: false } }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.space.findUniqueOrThrow({ where: { id: bSpace.id } });
    expect(after.name).toBe("Salón ajeno");
    expect(after.active).toBe(true);
  });

  it("A no puede borrar un salón de B; un deleteMany desde A no lo alcanza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bSpace = await makeSpace(b.id, "Salón ajeno");

    await expect(
      withOrg(a.id).space.delete({ where: { id: bSpace.id } }),
    ).rejects.toMatchObject({ code: "P2025" });

    await withOrg(a.id).space.deleteMany({});
    expect(await db.space.count({ where: { orgId: b.id } })).toBe(1);
  });

  it("un salón creado vía withOrg(A) no puede aterrizar en B: el orgId se fuerza", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");

    const created = await withOrg(a.id).space.create({
      data: { name: "Salón colado", orgId: b.id },
    });

    expect(created.orgId).toBe(a.id);
    expect(await db.space.count({ where: { orgId: b.id } })).toBe(0);
  });
});
