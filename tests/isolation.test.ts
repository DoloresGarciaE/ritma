import { describe, expect, it } from "vitest";

import { db, withOrg } from "@/lib/db";

import {
  makeDiscipline,
  makeGroup,
  makeMember,
  makeOrg,
  makeSession,
  makeSlot,
  makeStudent,
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
