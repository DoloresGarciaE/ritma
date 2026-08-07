import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addDays,
  addMonths,
  civilDateOf,
  civilToDb,
  dateInPeriod,
  daysInPeriod,
  dbToCivil,
  isCivilDate,
  isPeriod,
  mondayOf,
  periodOf,
  todayInTz,
  weekdayOf,
} from "./dates";

/**
 * Aritmética de fechas civiles (RN10). Funciones puras: se testean sin base y sin
 * navegador. Fechas de referencia: julio 2026 — el lunes 13 abre la semana 13–19.
 */

describe("isCivilDate", () => {
  it("acepta una fecha real bien formateada", () => {
    expect(isCivilDate("2026-07-13")).toBe(true);
  });

  it("rechaza formatos inválidos", () => {
    expect(isCivilDate("13/07/2026")).toBe(false);
    expect(isCivilDate("2026-7-13")).toBe(false);
    expect(isCivilDate("2026-07-13T00:00:00Z")).toBe(false);
    expect(isCivilDate("")).toBe(false);
  });

  it("rechaza fechas imposibles aunque el formato esté bien", () => {
    expect(isCivilDate("2026-02-30")).toBe(false);
    expect(isCivilDate("2026-13-01")).toBe(false);
    expect(isCivilDate("2026-04-31")).toBe(false);
  });

  it("acepta el 29 de febrero solo en bisiestos", () => {
    expect(isCivilDate("2028-02-29")).toBe(true);
    expect(isCivilDate("2026-02-29")).toBe(false);
  });
});

describe("weekdayOf", () => {
  it("usa la convención JS: 0 = domingo", () => {
    expect(weekdayOf("2026-07-13")).toBe(1); // lunes
    expect(weekdayOf("2026-07-18")).toBe(6); // sábado
    expect(weekdayOf("2026-07-19")).toBe(0); // domingo
  });
});

describe("addDays", () => {
  it("suma y resta dentro del mes", () => {
    expect(addDays("2026-07-13", 3)).toBe("2026-07-16");
    expect(addDays("2026-07-13", -1)).toBe("2026-07-12");
  });

  it("cruza mes y año sin sorpresas", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-12-28", 6)).toBe("2027-01-03");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("mondayOf", () => {
  it("un miércoles cae a su lunes", () => {
    expect(mondayOf("2026-07-15")).toBe("2026-07-13");
  });

  it("el domingo pertenece a la semana del lunes ANTERIOR", () => {
    expect(mondayOf("2026-07-19")).toBe("2026-07-13");
  });

  it("un lunes es su propio lunes", () => {
    expect(mondayOf("2026-07-13")).toBe("2026-07-13");
  });
});

describe("civilToDb / dbToCivil", () => {
  it("van y vuelven sin corrimiento", () => {
    const db = civilToDb("2026-07-13");
    expect(db.toISOString()).toBe("2026-07-13T00:00:00.000Z");
    expect(dbToCivil(db)).toBe("2026-07-13");
  });
});

describe("períodos (S3)", () => {
  it("isPeriod: forma YYYY-MM con mes real", () => {
    expect(isPeriod("2026-07")).toBe(true);
    expect(isPeriod("2026-12")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-00")).toBe(false);
    expect(isPeriod("2026-7")).toBe(false);
    expect(isPeriod("2026-07-01")).toBe(false);
    expect(isPeriod("")).toBe(false);
  });

  it("periodOf: el período de una fecha civil", () => {
    expect(periodOf("2026-07-15")).toBe("2026-07");
    expect(periodOf("2026-01-01")).toBe("2026-01");
  });

  it("addMonths: suma y resta, cruzando año en las dos direcciones", () => {
    expect(addMonths("2026-07", 1)).toBe("2026-08");
    expect(addMonths("2026-07", -1)).toBe("2026-06");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-07", -12)).toBe("2025-07");
    expect(addMonths("2026-07", 0)).toBe("2026-07");
  });

  it("daysInPeriod: meses cortos, largos y el febrero bisiesto", () => {
    expect(daysInPeriod("2026-07")).toBe(31);
    expect(daysInPeriod("2026-04")).toBe(30);
    expect(daysInPeriod("2026-02")).toBe(28);
    expect(daysInPeriod("2028-02")).toBe(29);
  });

  it("dateInPeriod: clampea al rango real del mes (la regla del dueDay 31)", () => {
    expect(dateInPeriod("2026-07", 10)).toBe("2026-07-10");
    expect(dateInPeriod("2026-04", 31)).toBe("2026-04-30");
    expect(dateInPeriod("2026-02", 31)).toBe("2026-02-28");
    expect(dateInPeriod("2026-07", 1)).toBe("2026-07-01");
    expect(dateInPeriod("2026-07", 0)).toBe("2026-07-01"); // defensivo: nunca día 0
  });
});

describe("todayInTz", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('"hoy" es el de la org, no el del servidor: a las 02:30Z en Buenos Aires es ayer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T02:30:00Z"));

    expect(todayInTz("America/Argentina/Buenos_Aires")).toBe("2026-07-17");
    expect(todayInTz("UTC")).toBe("2026-07-18");
  });

  it("una zona inválida cae al default AR en vez de tirar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T02:30:00Z"));

    expect(todayInTz("America/Springfield")).toBe("2026-07-17");
  });
});

describe("civilDateOf", () => {
  it("un instante UTC de madrugada es el día anterior en la zona de la org", () => {
    const instant = new Date("2026-07-11T02:30:00Z");
    expect(civilDateOf(instant, "America/Argentina/Buenos_Aires")).toBe("2026-07-10");
    expect(civilDateOf(instant, "UTC")).toBe("2026-07-11");
  });

  it("una zona inválida cae al default AR en vez de tirar", () => {
    expect(civilDateOf(new Date("2026-07-11T02:30:00Z"), "America/Springfield")).toBe("2026-07-10");
  });
});
