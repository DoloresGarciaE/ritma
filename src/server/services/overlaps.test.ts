import { describe, expect, it } from "vitest";

import {
  findScheduleOverlaps,
  overlapMessage,
  type OverlapNeighbor,
} from "./overlaps";

/**
 * El núcleo puro de solapamientos (S8): la matriz salón/profe/sin-salón del ticket,
 * caso por caso, sin base. El ensamblado con datos reales (redacción por scope, gate
 * INDEPENDENT) se prueba en tests/spaces.test.ts.
 */

const neighbor = (extra: Partial<OverlapNeighbor> = {}): OverlapNeighbor => ({
  groupId: "vecino",
  groupName: "Árabe inicial",
  spaceId: "salon-a",
  spaceName: "Salón A",
  teacherId: "profe-b",
  teacherName: "Caro Suárez",
  slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
  ...extra,
});

describe("findScheduleOverlaps — la matriz de conflictos", () => {
  it("mismo salón y rangos cruzados → conflicto FUERTE que trae salón, grupo y el rango del cruce", () => {
    const overlaps = findScheduleOverlaps(
      {
        spaceId: "salon-a",
        teacherId: "profe-a",
        slots: [{ weekday: 2, startTime: "18:30", durationMin: 60 }],
      },
      [neighbor()],
    );

    expect(overlaps).toEqual([
      {
        severity: "strong",
        kind: "space",
        groupName: "Árabe inicial",
        spaceName: "Salón A",
        teacherName: "Caro Suárez",
        weekday: 2,
        from: "18:30",
        to: "19:00",
      },
    ]);
    expect(overlapMessage(overlaps[0])).toBe(
      "Salón A ya está ocupado el martes 18:30–19:00 por Árabe inicial.",
    );
  });

  it("salones DISTINTOS (los dos asignados, profes distintos) → silencio total", () => {
    const overlaps = findScheduleOverlaps(
      {
        spaceId: "salon-b",
        teacherId: "profe-a",
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
      },
      [neighbor()],
    );
    expect(overlaps).toEqual([]);
  });

  it("alguno SIN salón → aviso SUAVE genérico (no podemos saber si chocan)", () => {
    const sinSalon = findScheduleOverlaps(
      {
        spaceId: null,
        teacherId: "profe-a",
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
      },
      [neighbor()],
    );
    expect(sinSalon).toHaveLength(1);
    expect(sinSalon[0]).toMatchObject({ severity: "soft", kind: "unknown-space" });

    // Y también al revés: el candidato tiene salón, el vecino no.
    const vecinoSinSalon = findScheduleOverlaps(
      {
        spaceId: "salon-b",
        teacherId: "profe-a",
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
      },
      [neighbor({ spaceId: null, spaceName: null })],
    );
    expect(vecinoSinSalon[0]).toMatchObject({ severity: "soft", kind: "unknown-space" });
  });

  it("el MISMO profe en dos grupos cruzados → FUERTE aunque los salones sean distintos", () => {
    const overlaps = findScheduleOverlaps(
      {
        spaceId: "salon-b",
        teacherId: "profe-b",
        slots: [{ weekday: 2, startTime: "18:30", durationMin: 90 }],
      },
      [neighbor()],
    );

    expect(overlaps).toEqual([
      expect.objectContaining({ severity: "strong", kind: "teacher", from: "18:30", to: "19:00" }),
    ]);
    expect(overlapMessage(overlaps[0])).toBe(
      "Caro Suárez ya da clase el martes 18:30–19:00 (Árabe inicial).",
    );
  });

  it("mismo salón Y mismo profe: UN solo conflicto — el salón alcanza para frenar", () => {
    const overlaps = findScheduleOverlaps(
      {
        spaceId: "salon-a",
        teacherId: "profe-b",
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
      },
      [neighbor()],
    );
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].kind).toBe("space");
  });

  it("espalda-con-espalda (termina 19:00, empieza 19:00) NO es cruce", () => {
    const overlaps = findScheduleOverlaps(
      {
        spaceId: "salon-a",
        teacherId: "profe-b",
        slots: [
          { weekday: 2, startTime: "19:00", durationMin: 60 }, // arranca cuando termina
          { weekday: 2, startTime: "17:00", durationMin: 60 }, // termina cuando arranca
        ],
      },
      [neighbor()],
    );
    expect(overlaps).toEqual([]);
  });

  it("otro día de semana no cruza, aunque el horario coincida", () => {
    const overlaps = findScheduleOverlaps(
      {
        spaceId: "salon-a",
        teacherId: null,
        slots: [{ weekday: 3, startTime: "18:00", durationMin: 60 }],
      },
      [neighbor()],
    );
    expect(overlaps).toEqual([]);
  });

  it("edición: los slots del PROPIO grupo no se comparan (groupId excluido)", () => {
    const overlaps = findScheduleOverlaps(
      {
        groupId: "vecino",
        spaceId: "salon-a",
        teacherId: "profe-b",
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
      },
      [neighbor()],
    );
    expect(overlaps).toEqual([]);
  });

  it("sin salón contra sin salón también es aviso suave (nadie sabe dónde son)", () => {
    const overlaps = findScheduleOverlaps(
      {
        spaceId: null,
        teacherId: "profe-a",
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
      },
      [neighbor({ spaceId: null, spaceName: null })],
    );
    expect(overlaps[0]).toMatchObject({ severity: "soft", kind: "unknown-space" });
  });

  it("franja multi-día: un conflicto POR DÍA cruzado, ordenados lunes-primero", () => {
    const overlaps = findScheduleOverlaps(
      {
        spaceId: "salon-a",
        teacherId: null,
        slots: [
          { weekday: 5, startTime: "18:00", durationMin: 60 },
          { weekday: 2, startTime: "18:00", durationMin: 60 },
        ],
      },
      [
        neighbor({
          slots: [
            { weekday: 2, startTime: "18:00", durationMin: 60 },
            { weekday: 5, startTime: "18:00", durationMin: 60 },
          ],
        }),
      ],
    );
    expect(overlaps.map((o) => o.weekday)).toEqual([2, 5]);
  });

  it("los fuertes van primero, y el vecino redactado se cuenta sin nombrarlo", () => {
    const overlaps = findScheduleOverlaps(
      {
        spaceId: "salon-a",
        teacherId: null,
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
      },
      [
        neighbor({ groupId: "sin-salon", spaceId: null, spaceName: null }),
        neighbor({ groupId: "redactado", groupName: null, teacherName: null }),
      ],
    );

    expect(overlaps.map((o) => o.severity)).toEqual(["strong", "soft"]);
    expect(overlapMessage(overlaps[0])).toBe(
      "Salón A ya está ocupado el martes 18:00–19:00 por otro grupo del estudio.",
    );
  });
});
