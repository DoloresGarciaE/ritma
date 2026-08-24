import { describe, expect, it } from "vitest";

import { money } from "./billing";
import { computeRentalCharge, type RentalOccurrence, type RentalSlice } from "./rentals";

/**
 * La mitad pura de la suite de alquileres (S10, RN7 + RN8): el cargo de un externo,
 * caso por caso, en Decimal puro. La mitad con base (generación idempotente del cron,
 * aislamiento, RN13, marcar pagado) vive en tests/rentals.test.ts.
 *
 * Convenciones del motor (decisiones S10):
 * - El cargo de un período usa EL acuerdo vigente al ÚLTIMO día de ese período — un
 *   solo acuerdo por cargo, sin tramos (a diferencia de RN6-bis).
 * - PER_SESSION/PER_HOUR cuentan ocurrencias NO canceladas (RN8) por su fecha
 *   MOSTRADA: una movida cobra donde se dictó.
 * - Cargo cero no se genera (sin sesiones → null); sin acuerdo vigente → null.
 * - Grupos sin salón cuentan igual y se SEÑALAN (`unspacedSessions`).
 */

const slice = (
  validFrom: string,
  rentalPeriod: RentalSlice["rentalPeriod"],
  amount: number,
): RentalSlice => ({ validFrom, rentalPeriod, rentalAmount: money(amount) });

const occ = (extra: Partial<RentalOccurrence> = {}): RentalOccurrence => ({
  date: "2026-08-05",
  durationMin: 60,
  cancelled: false,
  hasSpace: true,
  ...extra,
});

describe("computeRentalCharge — RN7", () => {
  it("MONTHLY: cargo fijo del período, las ocurrencias no importan", () => {
    const result = computeRentalCharge([slice("2026-01-01", "MONTHLY", 80000)], [], "2026-08");

    expect(result).not.toBeNull();
    expect(result!.amount.toNumber()).toBe(80000);
    expect(result!.rentalPeriod).toBe("MONTHLY");
    expect(result!.sessionsCount).toBe(0);
    expect(result!.minutesTotal).toBe(0);
    expect(result!.unspacedSessions).toBe(0);
  });

  it("PER_SESSION: cuenta las dictadas y EXCLUYE las canceladas (RN8)", () => {
    const result = computeRentalCharge(
      [slice("2026-01-01", "PER_SESSION", 5000)],
      [
        occ({ date: "2026-08-01" }),
        occ({ date: "2026-08-08" }),
        occ({ date: "2026-08-15", cancelled: true }),
        occ({ date: "2026-08-22" }),
        occ({ date: "2026-08-29" }),
      ],
      "2026-08",
    );

    expect(result!.sessionsCount).toBe(4);
    expect(result!.amount.toNumber()).toBe(20000); // 4 × 5.000
  });

  it("PER_HOUR: suma duraciones mixtas y multiplica por la tarifa", () => {
    const result = computeRentalCharge(
      [slice("2026-01-01", "PER_HOUR", 8000)],
      [occ({ durationMin: 60 }), occ({ durationMin: 90 }), occ({ durationMin: 45 })],
      "2026-08",
    );

    // 195 min = 3,25 h × 8.000 = 26.000.
    expect(result!.minutesTotal).toBe(195);
    expect(result!.amount.toNumber()).toBe(26000);
    expect(result!.sessionsCount).toBe(3);
  });

  it("PER_HOUR: redondeo HALF_UP a 2 decimales cuando la división no cierra", () => {
    const result = computeRentalCharge(
      [slice("2026-01-01", "PER_HOUR", 10000)],
      [occ({ durationMin: 50 })],
      "2026-08",
    );

    // 50/60 h × 10.000 = 8.333,333… → 8.333,33.
    expect(result!.amount.toNumber()).toBe(8333.33);
  });

  it("cambio de acuerdo ENTRE períodos: cada cargo con el suyo", () => {
    const slices = [
      slice("2026-01-01", "PER_SESSION", 5000),
      slice("2026-08-01", "PER_SESSION", 6000),
    ];

    const july = computeRentalCharge(slices, [occ({ date: "2026-07-10" })], "2026-07");
    const august = computeRentalCharge(slices, [occ({ date: "2026-08-10" })], "2026-08");

    expect(july!.amount.toNumber()).toBe(5000);
    expect(july!.rate.toNumber()).toBe(5000);
    expect(august!.amount.toNumber()).toBe(6000);
  });

  it("cambio a MITAD de período: rige el acuerdo vigente al ÚLTIMO día (decisión S10)", () => {
    const result = computeRentalCharge(
      [slice("2026-01-01", "PER_SESSION", 5000), slice("2026-08-15", "PER_SESSION", 6000)],
      [
        occ({ date: "2026-08-05" }),
        occ({ date: "2026-08-12" }),
        occ({ date: "2026-08-19" }),
        occ({ date: "2026-08-26" }),
      ],
      "2026-08",
    );

    // Un solo acuerdo, sin tramos: 4 × 6.000 = 24.000 (el caso armado de la sesión).
    expect(result!.amount.toNumber()).toBe(24000);
    expect(result!.rate.toNumber()).toBe(6000);
  });

  it("MONTHLY con vigencia a mitad del período igual genera (vigente al último día)", () => {
    const result = computeRentalCharge([slice("2026-08-15", "MONTHLY", 80000)], [], "2026-08");
    expect(result!.amount.toNumber()).toBe(80000);
  });

  it("sin sesiones no hay cargo: cero no se genera", () => {
    const none = computeRentalCharge([slice("2026-01-01", "PER_SESSION", 5000)], [], "2026-08");
    const allCancelled = computeRentalCharge(
      [slice("2026-01-01", "PER_SESSION", 5000)],
      [occ({ cancelled: true }), occ({ date: "2026-08-12", cancelled: true })],
      "2026-08",
    );
    const zeroHours = computeRentalCharge([slice("2026-01-01", "PER_HOUR", 8000)], [], "2026-08");

    expect(none).toBeNull();
    expect(allCancelled).toBeNull();
    expect(zeroHours).toBeNull();
  });

  it("sin acuerdo vigente al período no hay cargo", () => {
    const noSlices = computeRentalCharge([], [occ()], "2026-08");
    const futureOnly = computeRentalCharge(
      [slice("2026-09-01", "PER_SESSION", 5000)],
      [occ()],
      "2026-08",
    );

    expect(noSlices).toBeNull();
    expect(futureOnly).toBeNull();
  });

  it("grupo sin salón: la sesión CUENTA igual y queda señalada", () => {
    const result = computeRentalCharge(
      [slice("2026-01-01", "PER_SESSION", 5000)],
      [occ(), occ({ date: "2026-08-12", hasSpace: false }), occ({ date: "2026-08-19" })],
      "2026-08",
    );

    expect(result!.sessionsCount).toBe(3);
    expect(result!.amount.toNumber()).toBe(15000);
    expect(result!.unspacedSessions).toBe(1);
  });

  it("una ocurrencia fuera del período no entra (la movida cobra donde se dictó)", () => {
    const result = computeRentalCharge(
      [slice("2026-01-01", "PER_SESSION", 5000)],
      // La del 31/07 movida al 02/08 llega con date = 2026-08-02 (fecha mostrada) y
      // entra; una con fecha de julio quedó en el cargo de julio.
      [occ({ date: "2026-08-02" }), occ({ date: "2026-07-31" })],
      "2026-08",
    );

    expect(result!.sessionsCount).toBe(1);
    expect(result!.amount.toNumber()).toBe(5000);
  });

  it("acuerdos desordenados se ordenan solos", () => {
    const result = computeRentalCharge(
      [slice("2026-08-01", "PER_SESSION", 6000), slice("2026-01-01", "PER_SESSION", 5000)],
      [occ()],
      "2026-08",
    );

    expect(result!.rate.toNumber()).toBe(6000);
  });
});
