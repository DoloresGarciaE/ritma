import { describe, expect, it } from "vitest";

import { buildSalonDay } from "./salon-calendar";

/**
 * El armado de columnas del calendario por salón (S8, HU3.4): puro, sin motor nuevo.
 * Ocurrencias → columnas; canceladas ocupando su lugar (se muestran tachadas); el
 * grupo sin salón a su columna; los huecos explícitos con su rango.
 */

type Occ = {
  startTime: string;
  durationMin: number;
  spaceId: string | null;
  status: "SCHEDULED" | "CANCELLED" | "DONE";
  groupName: string;
};

const occ = (extra: Partial<Occ> = {}): Occ => ({
  startTime: "18:00",
  durationMin: 60,
  spaceId: "salon-a",
  status: "SCHEDULED",
  groupName: "Árabe inicial",
  ...extra,
});

const SPACES = [
  { id: "salon-a", name: "Salón A" },
  { id: "salon-b", name: "Salón B" },
];

describe("buildSalonDay", () => {
  it("una columna por salón activo, en orden; cada ocurrencia a la suya", () => {
    const day = buildSalonDay(
      [occ(), occ({ spaceId: "salon-b", groupName: "Canto", startTime: "10:00" })],
      SPACES,
    );

    expect(day.columns.map((c) => c.spaceName)).toEqual(["Salón A", "Salón B"]);
    const sessions = day.columns.map((c) =>
      c.items.filter((i) => i.kind === "session").map((i) => i.occurrence.groupName),
    );
    expect(sessions).toEqual([["Árabe inicial"], ["Canto"]]);
  });

  it("eje fijo 8:00–22:00 con sus marcas; el día vacío es TODO hueco en cada columna", () => {
    const day = buildSalonDay<Occ>([], SPACES);

    expect(day.axisStart).toBe(8 * 60);
    expect(day.axisEnd).toBe(22 * 60);
    expect(day.hourMarks[0]).toBe("08:00");
    expect(day.hourMarks.at(-1)).toBe("22:00");
    // Sin columna "Sin salón": no hay ocurrencias sin salón.
    expect(day.columns).toHaveLength(2);
    for (const column of day.columns) {
      expect(column.items).toEqual([
        { kind: "free", from: "08:00", to: "22:00", topMin: 0, heightMin: 14 * 60 },
      ]);
    }
  });

  it("una clase fuera del rango estira el eje a la hora en punto", () => {
    const day = buildSalonDay(
      [occ({ startTime: "07:30", durationMin: 60 }), occ({ startTime: "22:15", durationMin: 90 })],
      SPACES,
    );
    expect(day.axisStart).toBe(7 * 60);
    expect(day.axisEnd).toBe(24 * 60);
  });

  it("los huecos se cantan con su rango; posiciones relativas al eje", () => {
    const day = buildSalonDay([occ({ startTime: "10:00" }), occ({ startTime: "18:00" })], SPACES);

    const [colA] = day.columns;
    const frees = colA.items.filter((i) => i.kind === "free");
    expect(frees).toEqual([
      { kind: "free", from: "08:00", to: "10:00", topMin: 0, heightMin: 120 },
      { kind: "free", from: "11:00", to: "18:00", topMin: 180, heightMin: 420 },
      { kind: "free", from: "19:00", to: "22:00", topMin: 660, heightMin: 180 },
    ]);

    const session = colA.items.find(
      (i) => i.kind === "session" && i.occurrence.startTime === "10:00",
    );
    expect(session).toMatchObject({ topMin: 120, heightMin: 60, lane: 0 });
  });

  it("una CANCELADA sigue en su columna (se muestra tachada) y ocupa su lugar", () => {
    const day = buildSalonDay([occ({ status: "CANCELLED", startTime: "10:00" })], SPACES);

    const [colA] = day.columns;
    const session = colA.items.find((i) => i.kind === "session");
    expect(session).toMatchObject({ occurrence: { status: "CANCELLED" } });
    // El hueco NO tapa la cancelada: lo programado es lo que se cuenta.
    const frees = colA.items.filter((i) => i.kind === "free");
    expect(frees.map((f) => [f.from, f.to])).toEqual([
      ["08:00", "10:00"],
      ["11:00", "22:00"],
    ]);
  });

  it("el grupo sin salón va a la columna 'Sin salón', ÚLTIMA y solo si ese día existe", () => {
    const day = buildSalonDay([occ(), occ({ spaceId: null, groupName: "Suelto" })], SPACES);

    expect(day.columns.map((c) => c.spaceName)).toEqual(["Salón A", "Salón B", "Sin salón"]);
    const last = day.columns.at(-1)!;
    expect(last.spaceId).toBeNull();
    expect(
      last.items.filter((i) => i.kind === "session").map((i) => i.occurrence.groupName),
    ).toEqual(["Suelto"]);
  });

  it("dos clases cruzadas en el MISMO salón toman carriles distintos: el choque se VE", () => {
    const day = buildSalonDay(
      [
        occ({ startTime: "11:00", durationMin: 90, groupName: "Folklore" }),
        occ({ startTime: "12:00", durationMin: 60, groupName: "Teatro" }),
        occ({ startTime: "13:00", durationMin: 60, groupName: "Espalda con espalda" }),
      ],
      SPACES,
    );

    const sessions = day.columns[0].items.filter((i) => i.kind === "session");
    expect(sessions.map((s) => [s.occurrence.groupName, s.lane])).toEqual([
      ["Folklore", 0],
      ["Teatro", 1],
      ["Espalda con espalda", 0], // 13:00 arranca cuando el carril 0 quedó libre
    ]);
    // El hueco desaparece donde hay ocupación fusionada (11:00–14:00 ocupado).
    const frees = day.columns[0].items.filter((i) => i.kind === "free");
    expect(frees.map((f) => [f.from, f.to])).toEqual([
      ["08:00", "11:00"],
      ["14:00", "22:00"],
    ]);
  });

  it("huecos menores a 30 minutos no llevan cartel: quedan como aire", () => {
    const day = buildSalonDay([occ({ startTime: "10:00" }), occ({ startTime: "11:15" })], SPACES);
    const frees = day.columns[0].items.filter((i) => i.kind === "free");
    // El de 15 minutos (11:00–11:15) no aparece.
    expect(frees.map((f) => [f.from, f.to])).toEqual([
      ["08:00", "10:00"],
      ["12:15", "22:00"],
    ]);
  });
});
