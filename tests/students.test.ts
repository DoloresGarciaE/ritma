import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  createStudent,
  deactivateStudent,
  getStudent,
  listStudents,
  reactivateStudent,
  updateStudent,
} from "@/server/services/students";

import { makeOrg, makeStudent } from "./factories";

/** Los servicios de alumnos, contra Postgres real (HU2.1–2.3, RN9). */

describe("createStudent", () => {
  it("da de alta con lo mínimo (alta express: nombre y teléfono)", async () => {
    const org = await makeOrg("Danzas Malena", "INDEPENDENT");

    const { id } = await createStudent(org.id, {
      name: "Sofía Herrera",
      phone: "+541155554433",
      email: null,
      note: null,
    });

    const student = await db.student.findUniqueOrThrow({ where: { id } });
    expect(student.name).toBe("Sofía Herrera");
    expect(student.phone).toBe("+541155554433");
    expect(student.active).toBe(true);
    // El nombre normalizado se calcula solo: nunca puede quedar desfasado.
    expect(student.searchName).toBe("sofia herrera");
  });

  it("un alumno sin teléfono es válido", async () => {
    const org = await makeOrg("Danzas Malena", "INDEPENDENT");
    const { id } = await createStudent(org.id, {
      name: "Malena Ríos",
      phone: null,
      email: null,
      note: null,
    });

    expect((await db.student.findUniqueOrThrow({ where: { id } })).phone).toBeNull();
  });
});

describe("listStudents — búsqueda (HU2.2)", () => {
  it("encuentra sin importar mayúsculas ni acentos, en las dos direcciones", async () => {
    const org = await makeOrg("Estudio Compás");
    await makeStudent(org.id, "Sofía Herrera");
    await makeStudent(org.id, "Ana Pena");

    // Cargado CON tilde, buscado SIN tilde.
    expect((await listStudents(org.id, { query: "sofia" })).map((s) => s.name)).toEqual([
      "Sofía Herrera",
    ]);
    // Buscado CON tilde y en mayúsculas.
    expect((await listStudents(org.id, { query: "SOFÍA" })).map((s) => s.name)).toEqual([
      "Sofía Herrera",
    ]);
    // Cargado SIN ñ, buscado CON ñ.
    expect((await listStudents(org.id, { query: "peña" })).map((s) => s.name)).toEqual([
      "Ana Pena",
    ]);
  });

  it("busca también por apellido (substring, no solo prefijo)", async () => {
    const org = await makeOrg("Estudio Compás");
    await makeStudent(org.id, "Sofía Herrera");

    expect(await listStudents(org.id, { query: "herr" })).toHaveLength(1);
  });

  it("sin query, devuelve todo el padrón activo ordenado alfabéticamente", async () => {
    const org = await makeOrg("Estudio Compás");
    await makeStudent(org.id, "Zulema Costa");
    await makeStudent(org.id, "Álvarez Bruno"); // con tilde: no debe irse al final

    expect((await listStudents(org.id)).map((s) => s.name)).toEqual([
      "Álvarez Bruno",
      "Zulema Costa",
    ]);
  });
});

describe("deactivateStudent — baja lógica (HU2.3, RN9)", () => {
  it("saca al alumno de la lista activa pero NO lo borra: la ficha sigue", async () => {
    const org = await makeOrg("Estudio Compás");
    const student = await makeStudent(org.id, "Sofía Herrera");

    await deactivateStudent(org.id, student.id);

    // Ya no está entre los activos...
    expect(await listStudents(org.id)).toHaveLength(0);
    // ...pero la fila sigue existiendo y la ficha se puede abrir.
    expect(await db.student.count()).toBe(1);
    const ficha = await getStudent(org.id, student.id);
    expect(ficha).toMatchObject({ name: "Sofía Herrera", active: false });
  });

  it("aparece si se piden todos, y se puede reactivar", async () => {
    const org = await makeOrg("Estudio Compás");
    const student = await makeStudent(org.id, "Sofía Herrera");

    await deactivateStudent(org.id, student.id);
    expect(await listStudents(org.id, { includeInactive: true })).toHaveLength(1);

    await reactivateStudent(org.id, student.id);
    expect(await listStudents(org.id)).toHaveLength(1);
  });
});

describe("updateStudent", () => {
  it("al cambiar el nombre, recalcula el nombre de búsqueda", async () => {
    const org = await makeOrg("Estudio Compás");
    const student = await makeStudent(org.id, "Sofía Herrera");

    await updateStudent(org.id, student.id, {
      name: "Sofía Gómez",
      phone: null,
      email: "sofi@example.com",
      note: "Cambió de apellido",
    });

    const after = await db.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(after.searchName).toBe("sofia gomez");
    // Y por lo tanto se la encuentra por el apellido nuevo.
    expect(await listStudents(org.id, { query: "gomez" })).toHaveLength(1);
  });
});

describe("los servicios no cruzan organizaciones", () => {
  it("getStudent con el id de un alumno de otra org devuelve null", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bStudent = await makeStudent(b.id, "Malena Ríos");

    expect(await getStudent(a.id, bStudent.id)).toBeNull();
  });

  it("deactivateStudent sobre un alumno de otra org falla y no lo toca", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bStudent = await makeStudent(b.id, "Malena Ríos");

    await expect(deactivateStudent(a.id, bStudent.id)).rejects.toMatchObject({ code: "P2025" });
    expect((await db.student.findUniqueOrThrow({ where: { id: bStudent.id } })).active).toBe(true);
  });
});
