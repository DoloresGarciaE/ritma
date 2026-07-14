import { describe, expect, it } from "vitest";

import { db, withOrg } from "@/lib/db";

import { makeDiscipline, makeMember, makeOrg, makeStudent } from "./factories";

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
