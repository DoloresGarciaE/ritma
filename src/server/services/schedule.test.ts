import { describe, expect, it } from "vitest";

import {
  occurrencesForRange,
  type Occurrence,
  type SessionException,
  type SlotInfo,
} from "./schedule";

/**
 * El motor de la agenda (S2): la semana del profe TIENE que verse correcta, feriado
 * cancelado incluido (DoD). Función pura → casos exhaustivos, sin base.
 *
 * Semana de referencia: lunes 2026-07-13 → domingo 2026-07-19.
 */

const WEEK = { from: "2026-07-13", to: "2026-07-19" };

function slot(overrides: Partial<SlotInfo> & { id: string }): SlotInfo {
  return {
    groupId: "grupo-1",
    weekday: 2, // martes
    startTime: "19:00",
    durationMin: 60,
    ...overrides,
  };
}

function exception(
  overrides: Partial<SessionException> & { slotId: string; date: string },
): SessionException {
  return {
    status: "CANCELLED",
    note: null,
    movedToDate: null,
    movedToStartTime: null,
    ...overrides,
  };
}

/** Proyección compacta para asserts legibles: dónde y cómo quedó cada ocurrencia. */
function shape(occurrences: Occurrence[]) {
  return occurrences.map((o) => ({
    slotId: o.slotId,
    date: o.date,
    startTime: o.startTime,
    status: o.status,
    moved: o.moved,
  }));
}

describe("occurrencesForRange — generación base", () => {
  it("un grupo con dos franjas (mar y jue) genera sus dos ocurrencias, en orden", () => {
    const slots = [
      slot({ id: "jueves", weekday: 4, startTime: "18:00" }),
      slot({ id: "martes", weekday: 2, startTime: "18:00" }),
    ];

    expect(shape(occurrencesForRange(slots, [], WEEK))).toEqual([
      {
        slotId: "martes",
        date: "2026-07-14",
        startTime: "18:00",
        status: "SCHEDULED",
        moved: false,
      },
      {
        slotId: "jueves",
        date: "2026-07-16",
        startTime: "18:00",
        status: "SCHEDULED",
        moved: false,
      },
    ]);
  });

  it("dos franjas el MISMO día a la MISMA hora son dos ocurrencias distintas (identidad por slot)", () => {
    const slots = [
      slot({ id: "slot-b", groupId: "grupo-2" }),
      slot({ id: "slot-a", groupId: "grupo-1" }),
    ];

    const result = occurrencesForRange(slots, [], WEEK);
    expect(result).toHaveLength(2);
    // Desempate estable por slotId: no parpadea entre renders.
    expect(result.map((o) => o.slotId)).toEqual(["slot-a", "slot-b"]);
  });

  it("un rango que cruza mes genera las fechas correctas de los dos meses", () => {
    const slots = [slot({ id: "miercoles", weekday: 3 }), slot({ id: "sabado", weekday: 6 })];

    const result = occurrencesForRange(slots, [], { from: "2026-07-27", to: "2026-08-02" });
    expect(result.map((o) => o.date)).toEqual(["2026-07-29", "2026-08-01"]);
  });

  it("un rango que cruza año también", () => {
    const slots = [slot({ id: "viernes", weekday: 5 })];

    const result = occurrencesForRange(slots, [], { from: "2026-12-28", to: "2027-01-03" });
    expect(result.map((o) => o.date)).toEqual(["2027-01-01"]);
  });

  it("los límites del rango son inclusive en las dos puntas", () => {
    const slots = [slot({ id: "lunes", weekday: 1 }), slot({ id: "domingo", weekday: 0 })];

    const result = occurrencesForRange(slots, [], WEEK);
    expect(result.map((o) => o.date)).toEqual(["2026-07-13", "2026-07-19"]);
  });

  it("el domingo (weekday 0) cae como ÚLTIMO día de la semana lunes → domingo", () => {
    const slots = [slot({ id: "domingo", weekday: 0 }), slot({ id: "sabado", weekday: 6 })];

    const result = occurrencesForRange(slots, [], WEEK);
    expect(result.map((o) => o.slotId)).toEqual(["sabado", "domingo"]);
  });

  it("un rango de un solo día (vista día) trae solo ese día", () => {
    const slots = [slot({ id: "martes", weekday: 2 }), slot({ id: "jueves", weekday: 4 })];

    const result = occurrencesForRange(slots, [], { from: "2026-07-14", to: "2026-07-14" });
    expect(shape(result)).toEqual([
      {
        slotId: "martes",
        date: "2026-07-14",
        startTime: "19:00",
        status: "SCHEDULED",
        moved: false,
      },
    ]);
  });

  it("sin franjas no hay ocurrencias", () => {
    expect(occurrencesForRange([], [], WEEK)).toEqual([]);
  });

  it("un grupo inactivo no manda franjas, y sus excepciones sueltas se ignoran sin explotar", () => {
    // El contrato: sessions.ts solo pasa slots de grupos ACTIVOS. Las excepciones de un
    // grupo desactivado (o de una franja borrada) quedan huérfanas y no aparecen —
    // tampoco la reprogramada hacia adentro, porque su slot no está.
    const orphans = [
      exception({ slotId: "fantasma", date: "2026-07-14" }),
      exception({
        slotId: "fantasma",
        date: "2026-07-07",
        status: "SCHEDULED",
        movedToDate: "2026-07-15",
        movedToStartTime: "10:00",
      }),
    ];

    expect(occurrencesForRange([], orphans, WEEK)).toEqual([]);
  });
});

describe("occurrencesForRange — cancelaciones (RN8, DoD)", () => {
  it("la semana con el feriado cancelado: la sesión aparece CANCELLED en su lugar", () => {
    const slots = [slot({ id: "martes", weekday: 2 }), slot({ id: "jueves", weekday: 4 })];
    const feriado = [exception({ slotId: "martes", date: "2026-07-14", note: "Feriado" })];

    const result = occurrencesForRange(slots, feriado, WEEK);
    expect(shape(result)).toEqual([
      {
        slotId: "martes",
        date: "2026-07-14",
        startTime: "19:00",
        status: "CANCELLED",
        moved: false,
      },
      {
        slotId: "jueves",
        date: "2026-07-16",
        startTime: "19:00",
        status: "SCHEDULED",
        moved: false,
      },
    ]);
    expect(result[0].note).toBe("Feriado");
  });

  it("movida y LUEGO cancelada: se tacha en la posición movida, no en la original", () => {
    const slots = [slot({ id: "martes", weekday: 2 })];
    const exceptions = [
      exception({
        slotId: "martes",
        date: "2026-07-14",
        status: "CANCELLED",
        movedToDate: "2026-07-17",
        movedToStartTime: "20:00",
      }),
    ];

    expect(shape(occurrencesForRange(slots, exceptions, WEEK))).toEqual([
      {
        slotId: "martes",
        date: "2026-07-17",
        startTime: "20:00",
        status: "CANCELLED",
        moved: true,
      },
    ]);
  });
});

describe("occurrencesForRange — reprogramaciones (HU3.3)", () => {
  it("reprogramada a otro día del rango: desaparece del origen y aparece en destino", () => {
    const slots = [slot({ id: "martes", weekday: 2 })];
    const exceptions = [
      exception({
        slotId: "martes",
        date: "2026-07-14",
        status: "SCHEDULED",
        movedToDate: "2026-07-17",
        movedToStartTime: "18:30",
      }),
    ];

    const result = occurrencesForRange(slots, exceptions, WEEK);
    expect(shape(result)).toEqual([
      {
        slotId: "martes",
        date: "2026-07-17",
        startTime: "18:30",
        status: "SCHEDULED",
        moved: true,
      },
    ]);
    // La identidad original viaja con ella: el detalle puede decir "era el mar 14".
    expect(result[0].originalDate).toBe("2026-07-14");
    expect(result[0].originalStartTime).toBe("19:00");
  });

  it("reprogramada a la MISMA fecha con otra hora: una sola ocurrencia, en la hora nueva", () => {
    const slots = [slot({ id: "martes", weekday: 2 })];
    const exceptions = [
      exception({
        slotId: "martes",
        date: "2026-07-14",
        status: "SCHEDULED",
        movedToDate: "2026-07-14",
        movedToStartTime: "21:00",
      }),
    ];

    expect(shape(occurrencesForRange(slots, exceptions, WEEK))).toEqual([
      {
        slotId: "martes",
        date: "2026-07-14",
        startTime: "21:00",
        status: "SCHEDULED",
        moved: true,
      },
    ]);
  });

  it("reprogramada hacia FUERA del rango: no aparece en el rango", () => {
    const slots = [slot({ id: "martes", weekday: 2 })];
    const exceptions = [
      exception({
        slotId: "martes",
        date: "2026-07-14",
        status: "SCHEDULED",
        movedToDate: "2026-07-21",
        movedToStartTime: "19:00",
      }),
    ];

    expect(occurrencesForRange(slots, exceptions, WEEK)).toEqual([]);
  });

  it("reprogramada DESDE fuera del rango hacia adentro: aparece, además de la ocurrencia normal", () => {
    const slots = [slot({ id: "martes", weekday: 2 })];
    const exceptions = [
      exception({
        slotId: "martes",
        date: "2026-07-07", // el martes de la semana ANTERIOR
        status: "SCHEDULED",
        movedToDate: "2026-07-15",
        movedToStartTime: "10:00",
      }),
    ];

    const result = occurrencesForRange(slots, exceptions, WEEK);
    expect(shape(result)).toEqual([
      // La ocurrencia normal del martes 14 no se ve afectada…
      {
        slotId: "martes",
        date: "2026-07-14",
        startTime: "19:00",
        status: "SCHEDULED",
        moved: false,
      },
      // …y la movida entra como EXTRA, con su identidad original de la otra semana.
      {
        slotId: "martes",
        date: "2026-07-15",
        startTime: "10:00",
        status: "SCHEDULED",
        moved: true,
      },
    ]);
    expect(result[1].originalDate).toBe("2026-07-07");
  });

  it("dos movidas del mismo slot a la misma fecha y hora: orden estable por fecha original", () => {
    const slots = [slot({ id: "martes", weekday: 2 })];
    // Adrede en orden inverso: el desempate no puede depender del orden de las filas.
    const exceptions = [
      exception({
        slotId: "martes",
        date: "2026-07-14",
        status: "SCHEDULED",
        movedToDate: "2026-07-21",
        movedToStartTime: "19:00",
      }),
      exception({
        slotId: "martes",
        date: "2026-07-07",
        status: "SCHEDULED",
        movedToDate: "2026-07-21",
        movedToStartTime: "19:00",
      }),
    ];

    const result = occurrencesForRange(slots, exceptions, {
      from: "2026-07-20",
      to: "2026-07-26",
    });
    // La ocurrencia normal del 21 + las dos entrantes, todas a las 19:00 del mismo día.
    expect(result.map((o) => o.originalDate)).toEqual(["2026-07-07", "2026-07-14", "2026-07-21"]);
  });

  it("dentro de la misma semana no se duplica: origen y destino en el rango = UNA ocurrencia", () => {
    const slots = [slot({ id: "martes", weekday: 2 })];
    const exceptions = [
      exception({
        slotId: "martes",
        date: "2026-07-14",
        status: "SCHEDULED",
        movedToDate: "2026-07-16",
        movedToStartTime: "19:00",
      }),
    ];

    const result = occurrencesForRange(slots, exceptions, WEEK);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-07-16");
  });
});

describe("occurrencesForRange — notas y estados", () => {
  it("una excepción solo-nota deja la ocurrencia en su lugar, con la nota", () => {
    const slots = [slot({ id: "martes", weekday: 2 })];
    const exceptions = [
      exception({
        slotId: "martes",
        date: "2026-07-14",
        status: "SCHEDULED",
        note: "Traer palo de lluvia",
      }),
    ];

    const result = occurrencesForRange(slots, exceptions, WEEK);
    expect(shape(result)).toEqual([
      {
        slotId: "martes",
        date: "2026-07-14",
        startTime: "19:00",
        status: "SCHEDULED",
        moved: false,
      },
    ]);
    expect(result[0].note).toBe("Traer palo de lluvia");
  });

  it("una sesión DONE se tolera y conserva su estado (S2 no la produce)", () => {
    const slots = [slot({ id: "martes", weekday: 2 })];
    const exceptions = [exception({ slotId: "martes", date: "2026-07-14", status: "DONE" })];

    expect(occurrencesForRange(slots, exceptions, WEEK)[0].status).toBe("DONE");
  });
});
