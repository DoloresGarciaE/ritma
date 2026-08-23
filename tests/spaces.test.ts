import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { detectGroupOverlaps } from "@/server/services/overlaps";
import { ForbiddenError, type Actor, type DataScope } from "@/server/services/permissions";
import {
  createSpace,
  deactivateSpace,
  listSpaces,
  reactivateSpace,
  renameSpace,
  SpaceRuleError,
} from "@/server/services/spaces";

import {
  makeGroup,
  makeMember,
  makeOrg,
  makeSlot,
  makeSpace,
  makeTeacherProfile,
} from "./factories";

/**
 * S8 — salones y la matriz de conflictos contra Postgres real: la mitad con actor
 * (gestión: solo owner/admin de un STUDIO) y el ensamblado de solapamientos (gate
 * INDEPENDENT, redacción por scope de S7). El núcleo puro vive en
 * src/server/services/overlaps.test.ts.
 */

async function actorIn(orgId: string, role: "OWNER" | "ADMIN" | "TEACHER"): Promise<Actor> {
  const member = await makeMember(orgId, role);
  return { userId: member.userId, orgId, role };
}

describe("gestión de salones (spaces:manage — Plan §4)", () => {
  it("crear, listar (con grupos activos contados), renombrar", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");

    const { id } = await createSpace(admin, "Salón A");
    const space = await makeSpace(org.id, "Terraza");
    await makeGroup(org.id, "Árabe inicial", { spaceId: id });
    await makeGroup(org.id, "De baja", { spaceId: id, active: false });

    const listed = await listSpaces(admin);
    expect(listed.map((s) => [s.name, s.groupCount])).toEqual([
      ["Salón A", 1], // el inactivo no cuenta: la baja no lo desasignaría de nada visible
      ["Terraza", 0],
    ]);

    await renameSpace(admin, space.id, "Terraza techada");
    expect((await db.space.findUniqueOrThrow({ where: { id: space.id } })).name).toBe(
      "Terraza techada",
    );
  });

  it("nombre repetido en la org → SpaceRuleError, no crash (crear y renombrar)", async () => {
    const org = await makeOrg("Estudio Compás");
    const owner = await actorIn(org.id, "OWNER");
    await createSpace(owner, "Salón A");
    const { id } = await createSpace(owner, "Salón B");

    await expect(createSpace(owner, "Salón A")).rejects.toThrow(SpaceRuleError);
    await expect(renameSpace(owner, id, "Salón A")).rejects.toThrow(
      "Ya existe un salón con ese nombre.",
    );
  });

  it("un TEACHER no crea, no renombra, no desactiva (ForbiddenError, por API)", async () => {
    const org = await makeOrg("Estudio Compás");
    const teacher = await actorIn(org.id, "TEACHER");
    const space = await makeSpace(org.id, "Salón A");

    await expect(createSpace(teacher, "Salón B")).rejects.toThrow(ForbiddenError);
    await expect(renameSpace(teacher, space.id, "Robado")).rejects.toThrow(ForbiddenError);
    await expect(deactivateSpace(teacher, space.id)).rejects.toThrow(ForbiddenError);
    await expect(listSpaces(teacher)).rejects.toThrow(ForbiddenError);
    expect(await db.space.count({ where: { orgId: org.id } })).toBe(1);
  });

  it("en una org INDEPENDENT no existen salones, ni para su owner", async () => {
    const org = await makeOrg("Danzas Malena", "INDEPENDENT");
    const owner = await actorIn(org.id, "OWNER");

    await expect(createSpace(owner, "Salón A")).rejects.toThrow(
      "Los salones existen solo en un estudio.",
    );
  });

  it("desactivar: baja lógica + sus grupos quedan SIN salón en la misma transacción", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");
    const space = await makeSpace(org.id, "Salón A");
    const keep = await makeSpace(org.id, "Salón B");
    const g1 = await makeGroup(org.id, "Árabe inicial", { spaceId: space.id });
    const g2 = await makeGroup(org.id, "Canto grupal", { spaceId: space.id });
    const other = await makeGroup(org.id, "Contemporáneo", { spaceId: keep.id });

    const { unassigned } = await deactivateSpace(admin, space.id);
    expect(unassigned).toBe(2);

    const after = await db.space.findUniqueOrThrow({ where: { id: space.id } });
    expect(after.active).toBe(false); // lógica: la fila queda (RN9)
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: g1.id } })).spaceId).toBeNull();
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: g2.id } })).spaceId).toBeNull();
    // El otro salón ni se enteró.
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: other.id } })).spaceId).toBe(
      keep.id,
    );

    // Reactivar lo devuelve al calendario, sin re-asignar nada (avisado).
    await reactivateSpace(admin, space.id);
    expect((await db.space.findUniqueOrThrow({ where: { id: space.id } })).active).toBe(true);
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: g1.id } })).spaceId).toBeNull();
  });

  it("aislamiento entre orgs: el salón de B no se lista, no se renombra, no se desactiva desde A", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aAdmin = await actorIn(a.id, "ADMIN");
    const bSpace = await makeSpace(b.id, "Salón de B");

    expect((await listSpaces(aAdmin)).map((s) => s.name)).toEqual([]);
    await expect(renameSpace(aAdmin, bSpace.id, "Robado")).rejects.toMatchObject({
      code: "P2025",
    });
    await expect(deactivateSpace(aAdmin, bSpace.id)).rejects.toMatchObject({ code: "P2025" });

    const after = await db.space.findUniqueOrThrow({ where: { id: bSpace.id } });
    expect(after.name).toBe("Salón de B");
    expect(after.active).toBe(true);
  });
});

describe("detectGroupOverlaps — el ensamblado con datos reales", () => {
  it("junta salón, profe y franjas de los grupos activos y clasifica el cruce", async () => {
    const org = await makeOrg("Estudio Compás");
    const space = await makeSpace(org.id, "Salón A");
    const group = await makeGroup(org.id, "Árabe inicial", { spaceId: space.id });
    await makeSlot(org.id, group.id, { weekday: 2, startTime: "18:00", durationMin: 60 });
    // Un grupo INACTIVO en el mismo salón no cuenta: no está en el calendario.
    const inactive = await makeGroup(org.id, "Viejo", { spaceId: space.id, active: false });
    await makeSlot(org.id, inactive.id, { weekday: 2, startTime: "18:00", durationMin: 60 });

    const overlaps = await detectGroupOverlaps(
      org.id,
      { kind: "all" },
      {
        slots: [{ weekday: 2, startTime: "18:30", durationMin: 60 }],
        spaceId: space.id,
        teacherId: null,
      },
    );

    expect(overlaps).toEqual([
      expect.objectContaining({
        kind: "space",
        severity: "strong",
        groupName: "Árabe inicial",
        spaceName: "Salón A",
        from: "18:30",
        to: "19:00",
      }),
    ]);
  });

  it("edición: `undefined` hereda el salón/profe actuales del grupo y se excluye a sí mismo", async () => {
    const org = await makeOrg("Estudio Compás");
    const space = await makeSpace(org.id, "Salón A");
    const mine = await makeGroup(org.id, "Mi grupo", { spaceId: space.id });
    await makeSlot(org.id, mine.id, { weekday: 2, startTime: "18:00", durationMin: 60 });
    const other = await makeGroup(org.id, "Vecino", { spaceId: space.id });
    await makeSlot(org.id, other.id, { weekday: 2, startTime: "19:00", durationMin: 60 });

    // Estirar mi clase hasta 19:30 pisa al vecino EN MI MISMO salón (heredado).
    const overlaps = await detectGroupOverlaps(
      org.id,
      { kind: "all" },
      {
        groupId: mine.id,
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 90 }],
      },
    );

    expect(overlaps).toEqual([
      expect.objectContaining({ kind: "space", groupName: "Vecino", from: "19:00", to: "19:30" }),
    ]);
  });

  it("scope de TEACHER (S7): el cruce se detecta igual, pero el grupo ajeno NO se nombra", async () => {
    const org = await makeOrg("Estudio Compás");
    const space = await makeSpace(org.id, "Salón A");
    const profileA = await makeTeacherProfile(org.id, "Profe A");
    const profileB = await makeTeacherProfile(org.id, "Profe B");
    const mine = await makeGroup(org.id, "Mi grupo", {
      spaceId: space.id,
      teacherId: profileA.id,
    });
    await makeSlot(org.id, mine.id, { weekday: 2, startTime: "17:00", durationMin: 60 });
    const foreign = await makeGroup(org.id, "Secreto de B", {
      spaceId: space.id,
      teacherId: profileB.id,
    });
    await makeSlot(org.id, foreign.id, { weekday: 2, startTime: "18:00", durationMin: 60 });

    const scopeA: DataScope = { kind: "teacher", teacherProfileId: profileA.id };
    const overlaps = await detectGroupOverlaps(org.id, scopeA, {
      groupId: mine.id,
      slots: [{ weekday: 2, startTime: "17:30", durationMin: 60 }],
    });

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toMatchObject({
      kind: "space",
      groupName: null, // redactado: la física sí, el nombre no
      teacherName: null,
      spaceName: "Salón A",
    });
  });

  it("gate de la regla dura: en una INDEPENDENT no corre nada (devuelve vacío)", async () => {
    const org = await makeOrg("Danzas Malena", "INDEPENDENT");
    const profile = await makeTeacherProfile(org.id, "Malena", { kind: "OWNER_TEACHER" });
    const g1 = await makeGroup(org.id, "Árabe", { teacherId: profile.id });
    await makeSlot(org.id, g1.id, { weekday: 2, startTime: "18:00", durationMin: 60 });

    // Mismo profe, mismo horario: en un estudio sería fuerte; acá ni un pixel.
    const overlaps = await detectGroupOverlaps(
      org.id,
      { kind: "all" },
      {
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
        spaceId: null,
        teacherId: profile.id,
      },
    );
    expect(overlaps).toEqual([]);
  });
});
