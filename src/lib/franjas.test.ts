import { describe, expect, it } from "vitest";

import { occurrencesForRange, type SlotInfo } from "@/server/services/schedule";

import { expandFranjas, groupSlots, scheduleCollisionError, type Franja } from "./franjas";

/**
 * El mapeo franja↔slots del ticket "selección de horarios amigable": la franja es UI,
 * el modelo no cambia. La ida (expandir), la vuelta (re-agrupar), las colisiones y la
 * equivalencia con el motor de ocurrencias — todo puro, sin base.
 */

describe("expandFranjas — la ida", () => {
  it("una franja Lun/Mié/Vie 19:00 se expande a TRES slots, lunes-primero", () => {
    const franjas: Franja[] = [
      {
        days: [{ weekday: 5 }, { weekday: 1 }, { weekday: 3 }],
        startTime: "19:00",
        durationMin: 90,
      },
    ];

    expect(expandFranjas(franjas)).toEqual([
      { weekday: 1, startTime: "19:00", durationMin: 90 },
      { weekday: 3, startTime: "19:00", durationMin: 90 },
      { weekday: 5, startTime: "19:00", durationMin: 90 },
    ]);
  });

  it("el slotId de cada día viaja como id: la identidad sobrevive a la expansión", () => {
    const franjas: Franja[] = [
      {
        days: [{ weekday: 1, slotId: "lu" }, { weekday: 3 }],
        startTime: "19:00",
        durationMin: 60,
      },
    ];

    expect(expandFranjas(franjas)).toEqual([
      { id: "lu", weekday: 1, startTime: "19:00", durationMin: 60 },
      { weekday: 3, startTime: "19:00", durationMin: 60 }, // sin id: día nuevo → create
    ]);
  });

  it("un día repetido DENTRO de una franja se deduplica (defensa de payload)", () => {
    const franjas: Franja[] = [
      { days: [{ weekday: 1 }, { weekday: 1 }], startTime: "19:00", durationMin: 60 },
    ];

    expect(expandFranjas(franjas)).toHaveLength(1);
  });

  it("el domingo va último: la semana es lunes-primero (RN10)", () => {
    const franjas: Franja[] = [
      { days: [{ weekday: 0 }, { weekday: 6 }], startTime: "10:00", durationMin: 60 },
    ];

    expect(expandFranjas(franjas).map((s) => s.weekday)).toEqual([6, 0]);
  });
});

describe("groupSlots — la vuelta", () => {
  it("re-agrupa por (hora, duración): mar+jue 18:00/60 es UNA franja con sus dos slotIds", () => {
    const franjas = groupSlots([
      { id: "ma", weekday: 2, startTime: "18:00", durationMin: 60 },
      { id: "ju", weekday: 4, startTime: "18:00", durationMin: 60 },
    ]);

    expect(franjas).toEqual([
      {
        days: [
          { weekday: 2, slotId: "ma" },
          { weekday: 4, slotId: "ju" },
        ],
        startTime: "18:00",
        durationMin: 60,
      },
    ]);
  });

  it("misma hora pero DISTINTA duración: dos franjas — no se fusionan", () => {
    const franjas = groupSlots([
      { id: "ma", weekday: 2, startTime: "18:00", durationMin: 60 },
      { id: "ju", weekday: 4, startTime: "18:00", durationMin: 90 },
    ]);

    expect(franjas).toHaveLength(2);
    expect(franjas[0].days).toEqual([{ weekday: 2, slotId: "ma" }]);
    expect(franjas[1].days).toEqual([{ weekday: 4, slotId: "ju" }]);
  });

  it("mismo día en horarios distintos: dos franjas (siempre fue válido)", () => {
    const franjas = groupSlots([
      { id: "manana", weekday: 1, startTime: "10:00", durationMin: 60 },
      { id: "tarde", weekday: 1, startTime: "19:00", durationMin: 60 },
    ]);

    expect(franjas).toHaveLength(2);
  });

  it("ida y vuelta: groupSlots ∘ expandFranjas devuelve los MISMOS slots", () => {
    const original = [
      { id: "lu", weekday: 1, startTime: "19:00", durationMin: 90 },
      { id: "mi", weekday: 3, startTime: "19:00", durationMin: 90 },
      { id: "sa", weekday: 6, startTime: "10:00", durationMin: 60 },
    ];

    expect(expandFranjas(groupSlots(original))).toEqual(original);
  });
});

describe("scheduleCollisionError — colisiones internas", () => {
  const franja = (days: number[], startTime: string): Franja => ({
    days: days.map((weekday) => ({ weekday })),
    startTime,
    durationMin: 60,
  });

  it("mismo día y misma hora en dos franjas: error que NOMBRA el conflicto", () => {
    expect(scheduleCollisionError([franja([1, 3], "19:00"), franja([1], "19:00")])).toBe(
      "Lunes 19:00 está repetido.",
    );
  });

  it("mismo día en horarios distintos: válido, sin error", () => {
    expect(scheduleCollisionError([franja([1], "10:00"), franja([1], "19:00")])).toBeNull();
  });

  it("misma hora con duración distinta choca igual: arrancan juntas", () => {
    const conDuracion = (days: number[], startTime: string, durationMin: number): Franja => ({
      days: days.map((weekday) => ({ weekday })),
      startTime,
      durationMin,
    });

    expect(
      scheduleCollisionError([conDuracion([6], "10:00", 60), conDuracion([6], "10:00", 90)]),
    ).toBe("Sábado 10:00 está repetido.");
  });

  it("varios conflictos: los nombra a todos, lunes-primero", () => {
    expect(
      scheduleCollisionError([franja([6, 1], "10:00"), franja([1], "10:00"), franja([6], "10:00")]),
    ).toBe("Lunes 10:00 y Sábado 10:00 están repetidos.");
  });

  it("sin franjas o sin días no hay nada que chocar", () => {
    expect(scheduleCollisionError([])).toBeNull();
    expect(scheduleCollisionError([{ days: [], startTime: "19:00" }])).toBeNull();
  });
});

describe("equivalencia con el motor: expandir una franja == cargar los slots a mano", () => {
  const WEEK = { from: "2026-07-13", to: "2026-07-19" };

  it("las ocurrencias de una franja Lun/Mié/Vie son IDÉNTICAS a las de tres slots manuales", () => {
    const manual: SlotInfo[] = [
      { id: "lu", groupId: "g", weekday: 1, startTime: "19:00", durationMin: 90 },
      { id: "mi", groupId: "g", weekday: 3, startTime: "19:00", durationMin: 90 },
      { id: "vi", groupId: "g", weekday: 5, startTime: "19:00", durationMin: 90 },
    ];

    const expanded = expandFranjas([
      {
        days: [
          { weekday: 1, slotId: "lu" },
          { weekday: 3, slotId: "mi" },
          { weekday: 5, slotId: "vi" },
        ],
        startTime: "19:00",
        durationMin: 90,
      },
    ]).map((slot) => ({ id: slot.id!, groupId: "g", ...slot }) as SlotInfo);

    expect(occurrencesForRange(expanded, [], WEEK)).toEqual(occurrencesForRange(manual, [], WEEK));
    expect(occurrencesForRange(expanded, [], WEEK)).toHaveLength(3);
  });
});
