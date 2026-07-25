import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  createDiscipline,
  createGroup,
  getGroup,
  listGroups,
  setGroupActive,
  updateGroup,
} from "@/server/services/groups";

import { makeDiscipline, makeGroup, makeOrg, makeSession, makeSlot } from "./factories";

/**
 * Los servicios de grupos, contra Postgres real (HU3.1). Acá se prueban las dos defensas
 * que el hook de withOrg no puede dar solo: referencias cruzadas y escrituras anidadas.
 */

async function makeOrgWithDiscipline(name = "Estudio A") {
  const org = await makeOrg(name);
  const discipline = await makeDiscipline(org.id, "Árabe");
  return { org, discipline };
}

describe("createGroup", () => {
  it("crea el grupo con sus franjas anidadas, y TODAS quedan con el orgId correcto", async () => {
    const { org, discipline } = await makeOrgWithDiscipline();

    const { id } = await createGroup(org.id, {
      name: "Árabe inicial",
      disciplineId: discipline.id,
      defaultPrice: 18000,
      slots: [
        { weekday: 2, startTime: "18:00", durationMin: 60 },
        { weekday: 4, startTime: "18:00", durationMin: 60 },
      ],
    });

    // Verificación con db crudo: la escritura anidada NO pasa por el hook — el orgId de
    // las franjas lo puso el servicio, y esto lo fija.
    const slots = await db.scheduleSlot.findMany({ where: { groupId: id } });
    expect(slots).toHaveLength(2);
    expect(slots.every((slot) => slot.orgId === org.id)).toBe(true);

    const group = await db.classGroup.findUniqueOrThrow({ where: { id } });
    expect(group.orgId).toBe(org.id);
    expect(group.defaultPrice.toNumber()).toBe(18000);
  });

  it("con una disciplina de OTRA org rechaza y no escribe nada", async () => {
    const { org } = await makeOrgWithDiscipline();
    const b = await makeOrg("Estudio B");
    const bDiscipline = await makeDiscipline(b.id, "Folklore");

    await expect(
      createGroup(org.id, {
        name: "Colado",
        disciplineId: bDiscipline.id,
        defaultPrice: 10000,
        slots: [{ weekday: 1, startTime: "10:00", durationMin: 60 }],
      }),
    ).rejects.toThrow(/disciplina/i);

    expect(await db.classGroup.count()).toBe(0);
    expect(await db.scheduleSlot.count()).toBe(0);
  });
});

describe("listGroups / getGroup", () => {
  it("lista solo activos por defecto; includeInactive trae todo", async () => {
    const { org } = await makeOrgWithDiscipline();
    await makeGroup(org.id, "Activo");
    await makeGroup(org.id, "Dado de baja", { active: false });

    expect((await listGroups(org.id)).map((g) => g.name)).toEqual(["Activo"]);
    expect((await listGroups(org.id, { includeInactive: true })).map((g) => g.name)).toEqual([
      "Activo",
      "Dado de baja",
    ]);
  });

  it("las franjas salen lunes-primero: el domingo (weekday 0) al final", async () => {
    const { org } = await makeOrgWithDiscipline();
    const group = await makeGroup(org.id, "Franjas");
    await makeSlot(org.id, group.id, { weekday: 0, startTime: "10:00" }); // domingo
    await makeSlot(org.id, group.id, { weekday: 1, startTime: "10:00" }); // lunes

    const found = await getGroup(org.id, group.id);
    expect(found?.slots.map((slot) => slot.weekday)).toEqual([1, 0]);
  });

  it("getGroup de otra org devuelve null y el precio viaja como número", async () => {
    const { org } = await makeOrgWithDiscipline();
    const b = await makeOrg("Estudio B");
    const group = await makeGroup(org.id, "Árabe inicial", { defaultPrice: 18000 });

    expect(await getGroup(b.id, group.id)).toBeNull();

    const found = await getGroup(org.id, group.id);
    expect(found?.defaultPrice).toBe(18000);
    expect(typeof found?.defaultPrice).toBe("number");
  });
});

describe("updateGroup — el diff de franjas protege las excepciones", () => {
  async function groupWithSlotAndException() {
    const { org, discipline } = await makeOrgWithDiscipline();
    const group = await makeGroup(org.id, "Árabe inicial", { disciplineId: discipline.id });
    const slot = await makeSlot(org.id, group.id, { weekday: 2, startTime: "18:00" });
    // Martes 2026-07-14: una cancelada que NO se puede perder por un cambio menor.
    const session = await makeSession(org.id, group.id, slot.id, "2026-07-14");
    return { org, discipline, group, slot, session };
  }

  it("cambiar solo el nombre no toca las franjas ni sus excepciones", async () => {
    const { org, discipline, group, slot, session } = await groupWithSlotAndException();

    await updateGroup(org.id, group.id, {
      name: "Árabe inicial (renombrado)",
      disciplineId: discipline.id,
      defaultPrice: 20000,
      slots: [{ id: slot.id, weekday: 2, startTime: "18:00", durationMin: 60 }],
    });

    expect(await db.scheduleSlot.findUnique({ where: { id: slot.id } })).not.toBeNull();
    expect(await db.classSession.findUnique({ where: { id: session.id } })).not.toBeNull();
  });

  it("cambiar la hora de una franja la actualiza in place: sus excepciones SOBREVIVEN", async () => {
    const { org, discipline, group, slot, session } = await groupWithSlotAndException();

    await updateGroup(org.id, group.id, {
      name: "Árabe inicial",
      disciplineId: discipline.id,
      defaultPrice: 18000,
      slots: [{ id: slot.id, weekday: 2, startTime: "19:30", durationMin: 90 }],
    });

    const after = await db.scheduleSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after.startTime).toBe("19:30");
    expect(after.durationMin).toBe(90);
    expect(await db.classSession.findUnique({ where: { id: session.id } })).not.toBeNull();
  });

  it("cambiar el weekday es identidad nueva: franja recreada y excepciones viejas afuera", async () => {
    const { org, discipline, group, slot, session } = await groupWithSlotAndException();

    await updateGroup(org.id, group.id, {
      name: "Árabe inicial",
      disciplineId: discipline.id,
      defaultPrice: 18000,
      slots: [{ id: slot.id, weekday: 3, startTime: "18:00", durationMin: 60 }],
    });

    // La franja vieja (y su cancelada, por cascada) ya no existen; hay una nueva.
    expect(await db.scheduleSlot.findUnique({ where: { id: slot.id } })).toBeNull();
    expect(await db.classSession.findUnique({ where: { id: session.id } })).toBeNull();
    const slots = await db.scheduleSlot.findMany({ where: { groupId: group.id } });
    expect(slots).toHaveLength(1);
    expect(slots[0].weekday).toBe(3);
  });

  it("eliminar una franja del input la borra, y sus excepciones se van por cascada", async () => {
    const { org, discipline, group, slot, session } = await groupWithSlotAndException();
    const kept = await makeSlot(org.id, group.id, { weekday: 4, startTime: "18:00" });

    await updateGroup(org.id, group.id, {
      name: "Árabe inicial",
      disciplineId: discipline.id,
      defaultPrice: 18000,
      slots: [{ id: kept.id, weekday: 4, startTime: "18:00", durationMin: 60 }],
    });

    expect(await db.scheduleSlot.findUnique({ where: { id: slot.id } })).toBeNull();
    expect(await db.classSession.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await db.scheduleSlot.findUnique({ where: { id: kept.id } })).not.toBeNull();
  });

  it("una franja de OTRO grupo en el input no se toca: se trata como franja nueva", async () => {
    const { org, discipline, group } = await makeOrgWithDiscipline().then(async (ctx) => ({
      ...ctx,
      group: await makeGroup(ctx.org.id, "Mío", { disciplineId: ctx.discipline.id }),
    }));
    const other = await makeGroup(org.id, "Ajeno");
    const otherSlot = await makeSlot(org.id, other.id, { weekday: 5, startTime: "20:00" });

    await updateGroup(org.id, group.id, {
      name: "Mío",
      disciplineId: discipline.id,
      defaultPrice: 18000,
      slots: [{ id: otherSlot.id, weekday: 5, startTime: "09:00", durationMin: 45 }],
    });

    // La franja del otro grupo quedó intacta; la mía es NUEVA con esos datos.
    const untouched = await db.scheduleSlot.findUniqueOrThrow({ where: { id: otherSlot.id } });
    expect(untouched.startTime).toBe("20:00");
    expect(untouched.groupId).toBe(other.id);

    const mine = await db.scheduleSlot.findMany({ where: { groupId: group.id } });
    expect(mine).toHaveLength(1);
    expect(mine[0].startTime).toBe("09:00");
  });

  it("updateGroup de un grupo ajeno rechaza (P2025) sin tocar nada", async () => {
    const { org, discipline } = await makeOrgWithDiscipline();
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "De B");
    const bSlot = await makeSlot(b.id, bGroup.id);

    await expect(
      updateGroup(org.id, bGroup.id, {
        name: "Robado",
        disciplineId: discipline.id,
        defaultPrice: 1,
        slots: [],
      }),
    ).rejects.toMatchObject({ code: "P2025" });

    const after = await db.classGroup.findUniqueOrThrow({ where: { id: bGroup.id } });
    expect(after.name).toBe("De B");
    expect(await db.scheduleSlot.findUnique({ where: { id: bSlot.id } })).not.toBeNull();
  });
});

describe("setGroupActive", () => {
  it("apaga y prende el grupo (RN9: lógica, nada se borra)", async () => {
    const { org } = await makeOrgWithDiscipline();
    const group = await makeGroup(org.id, "Canto grupal");
    const slot = await makeSlot(org.id, group.id);

    await setGroupActive(org.id, group.id, false);
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: group.id } })).active).toBe(false);
    expect(await db.scheduleSlot.findUnique({ where: { id: slot.id } })).not.toBeNull();

    await setGroupActive(org.id, group.id, true);
    expect((await db.classGroup.findUniqueOrThrow({ where: { id: group.id } })).active).toBe(true);
  });
});

describe("createDiscipline", () => {
  it("crea, y repetirla devuelve la misma sin duplicar", async () => {
    const org = await makeOrg("Estudio A");

    const first = await createDiscipline(org.id, "Contemporáneo");
    const second = await createDiscipline(org.id, "Contemporáneo");

    expect(second.id).toBe(first.id);
    expect(await db.discipline.count({ where: { orgId: org.id } })).toBe(1);
  });
});
