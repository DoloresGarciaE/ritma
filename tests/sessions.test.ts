import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  cancelSession,
  rescheduleSession,
  restoreSession,
  weekData,
} from "@/server/services/sessions";

import { makeDiscipline, makeGroup, makeOrg, makeSession, makeSlot } from "./factories";

/**
 * Los servicios de sesiones, contra Postgres real (HU3.2–3.3, RN8). El motor puro ya
 * está testeado aparte (schedule.test.ts): acá se prueba la INTEGRACIÓN — qué se trae de
 * la base, qué se persiste, y que nada cruza organizaciones.
 *
 * Semana de referencia: lunes 2026-07-13 → domingo 2026-07-19.
 */

const WEEK_START = "2026-07-13";

async function agendaFixture() {
  const org = await makeOrg("Danzas Malena");
  const discipline = await makeDiscipline(org.id, "Árabe");
  const group = await makeGroup(org.id, "Árabe inicial", { disciplineId: discipline.id });
  const tuesday = await makeSlot(org.id, group.id, { weekday: 2, startTime: "18:00" });
  const thursday = await makeSlot(org.id, group.id, { weekday: 4, startTime: "18:00" });
  return { org, discipline, group, tuesday, thursday };
}

describe("weekData", () => {
  it("integra franjas + excepciones y enriquece con grupo, disciplina, precio y color", async () => {
    const { org, group, tuesday } = await agendaFixture();
    await cancelSession(
      org.id,
      { kind: "all" },
      { slotId: tuesday.id, date: "2026-07-14", note: "Feriado" },
    );

    const week = await weekData(org.id, { kind: "all" }, WEEK_START);

    expect(week.occurrences.map((o) => [o.date, o.status])).toEqual([
      ["2026-07-14", "CANCELLED"],
      ["2026-07-16", "SCHEDULED"],
    ]);

    const cancelled = week.occurrences[0];
    expect(cancelled.groupName).toBe("Árabe inicial");
    expect(cancelled.disciplineName).toBe("Árabe");
    expect(cancelled.defaultPrice).toBe(20000);
    expect(typeof cancelled.defaultPrice).toBe("number");
    expect(cancelled.note).toBe("Feriado");
    expect(cancelled.groupId).toBe(group.id);
  });

  it("un grupo inactivo desaparece de la agenda (sus excepciones no lo reviven)", async () => {
    const { org, tuesday } = await agendaFixture();
    await cancelSession(org.id, { kind: "all" }, { slotId: tuesday.id, date: "2026-07-14" });
    await db.classGroup.updateMany({ data: { active: false } });

    const week = await weekData(org.id, { kind: "all" }, WEEK_START);
    expect(week.occurrences).toEqual([]);
  });

  it("trae la reprogramada HACIA esta semana desde otra (query por movedToDate)", async () => {
    const { org, tuesday } = await agendaFixture();
    // El martes de la semana ANTERIOR, movido al miércoles de esta.
    await rescheduleSession(
      org.id,
      { kind: "all" },
      {
        slotId: tuesday.id,
        date: "2026-07-07",
        movedToDate: "2026-07-15",
        movedToStartTime: "10:00",
      },
    );

    const week = await weekData(org.id, { kind: "all" }, WEEK_START);
    const moved = week.occurrences.find((o) => o.moved);
    expect(moved).toMatchObject({
      date: "2026-07-15",
      startTime: "10:00",
      originalDate: "2026-07-07",
    });
  });

  it("no mezcla organizaciones", async () => {
    const { org } = await agendaFixture();
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "De B");
    await makeSlot(b.id, bGroup.id, { weekday: 2, startTime: "09:00" });

    const week = await weekData(org.id, { kind: "all" }, WEEK_START);
    expect(week.occurrences.every((o) => o.groupName === "Árabe inicial")).toBe(true);
  });

  it("el color es estable por orden de creación de la disciplina, cíclico módulo N", async () => {
    const org = await makeOrg("Estudio Compás");
    const names = ["Árabe", "Contemporáneo", "Funcional", "Canto"];
    const groups: string[] = [];
    for (const name of names) {
      const discipline = await makeDiscipline(org.id, name);
      const group = await makeGroup(org.id, `Grupo de ${name}`, { disciplineId: discipline.id });
      await makeSlot(org.id, group.id, { weekday: 2, startTime: "10:00" });
      groups.push(group.id);
    }

    const week = await weekData(org.id, { kind: "all" }, WEEK_START);
    const colorByGroup = new Map(week.occurrences.map((o) => [o.groupId, o.colorIndex]));

    // 3 tokens: la cuarta disciplina repite el ciclo (paleta parametrizada, Color §4).
    expect(groups.map((id) => colorByGroup.get(id))).toEqual([0, 1, 2, 0]);
  });
});

describe("cancelSession", () => {
  it("crea la excepción una sola vez: cancelar dos veces es idempotente", async () => {
    const { org, tuesday } = await agendaFixture();

    await cancelSession(
      org.id,
      { kind: "all" },
      { slotId: tuesday.id, date: "2026-07-14", note: "Feriado" },
    );
    await cancelSession(org.id, { kind: "all" }, { slotId: tuesday.id, date: "2026-07-14" });

    const rows = await db.classSession.findMany({ where: { slotId: tuesday.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("CANCELLED");
    expect(rows[0].note).toBe("Feriado"); // la nota no se pisa si no mandan otra
  });

  it("con una franja de OTRA org rechaza y no queda fila en NINGUNA org", async () => {
    const { org } = await agendaFixture();
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "De B");
    const bSlot = await makeSlot(b.id, bGroup.id, { weekday: 2 });

    await expect(
      cancelSession(org.id, { kind: "all" }, { slotId: bSlot.id, date: "2026-07-14" }),
    ).rejects.toThrow(/franja/i);

    expect(await db.classSession.count()).toBe(0);
  });

  it("con una fecha que no es ocurrencia de la franja (otro weekday) rechaza", async () => {
    const { org, tuesday } = await agendaFixture();

    // 2026-07-15 es miércoles; la franja es de martes.
    await expect(
      cancelSession(org.id, { kind: "all" }, { slotId: tuesday.id, date: "2026-07-15" }),
    ).rejects.toThrow(/ocurrencia/i);

    expect(await db.classSession.count()).toBe(0);
  });
});

describe("rescheduleSession", () => {
  it("guarda la nueva posición con la identidad original intacta", async () => {
    const { org, tuesday } = await agendaFixture();

    await rescheduleSession(
      org.id,
      { kind: "all" },
      {
        slotId: tuesday.id,
        date: "2026-07-14",
        movedToDate: "2026-07-17",
        movedToStartTime: "18:30",
      },
    );

    const row = await db.classSession.findFirstOrThrow({ where: { slotId: tuesday.id } });
    expect(row.date.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    expect(row.movedToDate?.toISOString()).toBe("2026-07-17T00:00:00.000Z");
    expect(row.movedToStartTime).toBe("18:30");
    expect(row.status).toBe("SCHEDULED");
  });

  it("mover una cancelada la DES-cancela", async () => {
    const { org, tuesday } = await agendaFixture();
    await cancelSession(org.id, { kind: "all" }, { slotId: tuesday.id, date: "2026-07-14" });

    await rescheduleSession(
      org.id,
      { kind: "all" },
      {
        slotId: tuesday.id,
        date: "2026-07-14",
        movedToDate: "2026-07-17",
        movedToStartTime: "18:00",
      },
    );

    const row = await db.classSession.findFirstOrThrow({ where: { slotId: tuesday.id } });
    expect(row.status).toBe("SCHEDULED");
  });

  it("con una franja de OTRA org rechaza sin escribir", async () => {
    const { org } = await agendaFixture();
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "De B");
    const bSlot = await makeSlot(b.id, bGroup.id, { weekday: 2 });

    await expect(
      rescheduleSession(
        org.id,
        { kind: "all" },
        {
          slotId: bSlot.id,
          date: "2026-07-14",
          movedToDate: "2026-07-17",
          movedToStartTime: "10:00",
        },
      ),
    ).rejects.toThrow(/franja/i);

    expect(await db.classSession.count()).toBe(0);
  });
});

describe("restoreSession", () => {
  it("borra la excepción: la verdad vuelve a ser la calculada", async () => {
    const { org, tuesday } = await agendaFixture();
    await cancelSession(org.id, { kind: "all" }, { slotId: tuesday.id, date: "2026-07-14" });

    await restoreSession(org.id, { kind: "all" }, { slotId: tuesday.id, date: "2026-07-14" });

    expect(await db.classSession.count()).toBe(0);
    const week = await weekData(org.id, { kind: "all" }, WEEK_START);
    expect(week.occurrences.find((o) => o.date === "2026-07-14")?.status).toBe("SCHEDULED");
  });

  it("inexistente o ajena → P2025, y la fila de la otra org sobrevive", async () => {
    const { org, tuesday } = await agendaFixture();
    const b = await makeOrg("Estudio B");
    const bGroup = await makeGroup(b.id, "De B");
    const bSlot = await makeSlot(b.id, bGroup.id, { weekday: 2 });
    const bSession = await makeSession(b.id, bGroup.id, bSlot.id, "2026-07-14");

    await expect(
      restoreSession(org.id, { kind: "all" }, { slotId: tuesday.id, date: "2026-07-14" }),
    ).rejects.toMatchObject({ code: "P2025" });

    await expect(
      restoreSession(org.id, { kind: "all" }, { slotId: bSlot.id, date: "2026-07-14" }),
    ).rejects.toMatchObject({ code: "P2025" });

    expect(await db.classSession.findUnique({ where: { id: bSession.id } })).not.toBeNull();
  });
});
