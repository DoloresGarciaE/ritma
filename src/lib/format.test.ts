import { describe, expect, it } from "vitest";

import {
  formatFullDayDate,
  formatListDate,
  formatMoney,
  formatPeriod,
  formatTimeRange,
  formatWeekRange,
} from "./format";

/**
 * Los formatos únicos de la app (Componentes §4.2). Si un formato cambia acá, cambia en
 * todas las pantallas a la vez — por eso se fijan con tests.
 */

describe("formatMoney", () => {
  it("punto de miles, sin decimales salvo necesidad, signo explícito", () => {
    expect(formatMoney(20000)).toBe("$20.000");
    expect(formatMoney(1234567.5)).toBe("$1.234.567,50");
    expect(formatMoney(-1500)).toBe("-$1.500");
  });
});

describe("formatListDate", () => {
  it('es el "mar 12/05" de §4.2', () => {
    expect(formatListDate("2026-05-12")).toBe("mar 12/05");
    expect(formatListDate("2026-07-13")).toBe("lun 13/07");
    expect(formatListDate("2026-08-01")).toBe("sáb 01/08");
  });
});

describe("formatFullDayDate", () => {
  it("día completo para las confirmaciones que nombran el objeto (§3.8)", () => {
    expect(formatFullDayDate("2026-05-12")).toBe("martes 12/05");
    expect(formatFullDayDate("2026-07-15")).toBe("miércoles 15/07");
  });
});

describe("formatWeekRange", () => {
  it("mismo mes: compacto", () => {
    expect(formatWeekRange("2026-05-11", "2026-05-17")).toBe("11–17 may");
  });

  it("cruzando mes: cada punta con su mes", () => {
    expect(formatWeekRange("2026-07-27", "2026-08-02")).toBe("27 jul – 2 ago");
  });

  it("cruzando año: mismo patrón", () => {
    expect(formatWeekRange("2026-12-28", "2027-01-03")).toBe("28 dic – 3 ene");
  });
});

describe("formatPeriod", () => {
  it('es el "Marzo 2026" de §4.2', () => {
    expect(formatPeriod("2026-03")).toBe("Marzo 2026");
    expect(formatPeriod("2026-07")).toBe("Julio 2026");
    expect(formatPeriod("2027-01")).toBe("Enero 2027");
  });
});

describe("formatTimeRange", () => {
  it("hora de inicio + duración → rango", () => {
    expect(formatTimeRange("19:00", 90)).toBe("19:00–20:30");
    expect(formatTimeRange("08:30", 45)).toBe("08:30–09:15");
  });

  it("cruza medianoche sin drama", () => {
    expect(formatTimeRange("23:30", 90)).toBe("23:30–01:00");
  });
});
