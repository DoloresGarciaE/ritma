import { describe, expect, it } from "vitest";

import {
  dropInCharge,
  generateCharges,
  isActiveInPeriod,
  markOverdue,
  type BillingEnrollment,
  type BillingOrgConfig,
  type OverdueCandidate,
} from "./billing";

/**
 * RN1–RN3 con cobertura total (plan-implementación §10: acá va todo el rigor). Los casos
 * borde del mandato S3 tienen nombre propio: re-corrida del cron, alta el 31, endDate a
 * mitad de mes, org con dueDay cambiado.
 *
 * El monto es opaco para el servicio: en estos tests viaja como number por comodidad,
 * en producción es Prisma Decimal — el módulo no puede operar con él en ningún caso.
 */

const CONFIG: BillingOrgConfig = { dueDay: 10, currency: "ARS" };

let seq = 0;

function monthly(extra: Partial<BillingEnrollment<number>> = {}): BillingEnrollment<number> {
  seq += 1;
  return {
    id: `enr_${seq}`,
    plan: "MONTHLY",
    price: 18000,
    startDate: "2026-01-05",
    endDate: null,
    ...extra,
  };
}

describe("generateCharges — RN1: una cuota por inscripción mensual activa", () => {
  it("genera con amount = precio pactado, la moneda de la org y dueDate el día dueDay", () => {
    const enrollment = monthly({ price: 22000 });

    const charges = generateCharges([enrollment], "2026-07", CONFIG);

    expect(charges).toEqual([
      {
        enrollmentId: enrollment.id,
        period: "2026-07",
        amount: 22000,
        currency: "ARS",
        dueDate: "2026-07-10",
      },
    ]);
  });

  it("cada inscripción activa genera la suya; las DROP_IN nunca entran al cron", () => {
    const a = monthly();
    const b = monthly({ price: 15000 });
    const dropIn = monthly({ plan: "DROP_IN" });

    const charges = generateCharges([a, dropIn, b], "2026-07", CONFIG);

    expect(charges.map((c) => c.enrollmentId)).toEqual([a.id, b.id]);
  });

  it("re-corrida del cron: la misma entrada produce EXACTAMENTE la misma salida", () => {
    const enrollments = [monthly(), monthly({ price: 20000, startDate: "2026-07-15" })];

    const first = generateCharges(enrollments, "2026-07", CONFIG);
    const second = generateCharges(enrollments, "2026-07", CONFIG);

    expect(second).toEqual(first);
  });

  it("lista vacía → sin cuotas; período inválido → throw (bug del caller, no negocio)", () => {
    expect(generateCharges([], "2026-07", CONFIG)).toEqual([]);
    expect(() => generateCharges([], "2026-13", CONFIG)).toThrow(/período inválido/);
    expect(() => generateCharges([], "julio", CONFIG)).toThrow(/período inválido/);
  });
});

describe("generateCharges — RN2: altas a mitad de mes", () => {
  it("alta a mitad de mes → cuota COMPLETA del mes en curso (el ajuste es manual)", () => {
    const enrollment = monthly({ startDate: "2026-07-15", price: 18000 });

    const charges = generateCharges([enrollment], "2026-07", CONFIG);

    expect(charges).toHaveLength(1);
    expect(charges[0].amount).toBe(18000);
  });

  it("alta el 31: genera para ese mes y para el siguiente", () => {
    const enrollment = monthly({ startDate: "2026-07-31" });

    expect(generateCharges([enrollment], "2026-07", CONFIG)).toHaveLength(1);
    expect(generateCharges([enrollment], "2026-08", CONFIG)).toHaveLength(1);
  });

  it("alta futura: los períodos ANTERIORES al alta no generan (HU4.1)", () => {
    const enrollment = monthly({ startDate: "2026-08-05" });

    expect(generateCharges([enrollment], "2026-07", CONFIG)).toEqual([]);
    expect(generateCharges([enrollment], "2026-08", CONFIG)).toHaveLength(1);
  });

  it("límites inclusivos: alta el primer y el último día del período generan", () => {
    const first = monthly({ startDate: "2026-07-01" });
    const last = monthly({ startDate: "2026-07-31" });

    expect(generateCharges([first, last], "2026-07", CONFIG)).toHaveLength(2);
  });
});

describe("generateCharges — RN9: bajas", () => {
  it("endDate anterior al período → no genera", () => {
    const enrollment = monthly({ endDate: "2026-06-20" });

    expect(generateCharges([enrollment], "2026-07", CONFIG)).toEqual([]);
  });

  it("endDate a MITAD de mes → el período de la baja todavía genera (desde el siguiente, no)", () => {
    const enrollment = monthly({ endDate: "2026-07-15" });

    expect(generateCharges([enrollment], "2026-07", CONFIG)).toHaveLength(1);
    expect(generateCharges([enrollment], "2026-08", CONFIG)).toEqual([]);
  });

  it("límites: baja el último día del mes anterior no genera; el primer día del período, sí", () => {
    const lastOfJune = monthly({ endDate: "2026-06-30" });
    const firstOfJuly = monthly({ endDate: "2026-07-01" });

    const charges = generateCharges([lastOfJune, firstOfJuly], "2026-07", CONFIG);

    expect(charges.map((c) => c.enrollmentId)).toEqual([firstOfJuly.id]);
  });
});

describe("generateCharges — vencimientos (RN1 + RN10)", () => {
  it("org con dueDay cambiado: el vencimiento sigue a la org, no a un default", () => {
    const charges = generateCharges([monthly()], "2026-07", { dueDay: 1, currency: "ARS" });

    expect(charges[0].dueDate).toBe("2026-07-01");
  });

  it("dueDay 31 se clampea al último día real: abril → 30, febrero → 28, bisiesto → 29", () => {
    const config = { dueDay: 31, currency: "ARS" };
    const enrollment = monthly();

    expect(generateCharges([enrollment], "2026-04", config)[0].dueDate).toBe("2026-04-30");
    expect(generateCharges([enrollment], "2026-02", config)[0].dueDate).toBe("2026-02-28");
    expect(generateCharges([enrollment], "2028-02", config)[0].dueDate).toBe("2028-02-29");
    expect(generateCharges([enrollment], "2026-07", config)[0].dueDate).toBe("2026-07-31");
  });

  it("la moneda de la cuota es la de la org al generar (RN10)", () => {
    const charges = generateCharges([monthly()], "2026-07", { dueDay: 10, currency: "UYU" });

    expect(charges[0].currency).toBe("UYU");
  });
});

describe("isActiveInPeriod — la regla de actividad, aislada", () => {
  it("abierta y arrancada: activa", () => {
    expect(isActiveInPeriod({ startDate: "2026-01-05", endDate: null }, "2026-07")).toBe(true);
  });

  it("los cuatro bordes del período", () => {
    // Alta justo después del período / baja justo antes: inactiva.
    expect(isActiveInPeriod({ startDate: "2026-08-01", endDate: null }, "2026-07")).toBe(false);
    expect(isActiveInPeriod({ startDate: "2026-01-05", endDate: "2026-06-30" }, "2026-07")).toBe(
      false,
    );
    // Alta el último día / baja el primer día: activa.
    expect(isActiveInPeriod({ startDate: "2026-07-31", endDate: null }, "2026-07")).toBe(true);
    expect(isActiveInPeriod({ startDate: "2026-01-05", endDate: "2026-07-01" }, "2026-07")).toBe(
      true,
    );
  });
});

describe("dropInCharge — clase suelta (propuesta RN11)", () => {
  it("un cargo único: período del alta, precio pactado, vence a 7 días", () => {
    const charge = dropInCharge({ id: "enr_d", price: 9000, startDate: "2026-07-20" }, CONFIG);

    expect(charge).toEqual({
      enrollmentId: "enr_d",
      period: "2026-07",
      amount: 9000,
      currency: "ARS",
      dueDate: "2026-07-27",
    });
  });

  it("el vencimiento cruza de mes (y de año) sin drama", () => {
    expect(dropInCharge({ id: "e", price: 1, startDate: "2026-07-28" }, CONFIG).dueDate).toBe(
      "2026-08-04",
    );
    expect(dropInCharge({ id: "e", price: 1, startDate: "2026-12-29" }, CONFIG).dueDate).toBe(
      "2027-01-05",
    );
  });

  it("el dueDay de la org NO interviene: 7 días desde el alta, siempre", () => {
    const charge = dropInCharge(
      { id: "e", price: 1, startDate: "2026-07-02" },
      { currency: "ARS" },
    );

    expect(charge.dueDate).toBe("2026-07-09"); // no el 10 (dueDay), ni el 1
  });
});

describe("markOverdue — RN3: transiciones exactas", () => {
  function charge(status: OverdueCandidate["status"], dueDate: string): OverdueCandidate {
    seq += 1;
    return { id: `chg_${seq}`, status, dueDate };
  }

  it("PENDING y PARTIAL vencidas pasan; las que vencen HOY todavía no (hoy > dueDate)", () => {
    const past = charge("PENDING", "2026-07-10");
    const partial = charge("PARTIAL", "2026-07-09");
    const today = charge("PENDING", "2026-07-15");
    const future = charge("PENDING", "2026-07-20");

    expect(markOverdue([past, partial, today, future], "2026-07-15")).toEqual([
      past.id,
      partial.id,
    ]);
  });

  it("PAID y WAIVED JAMÁS pasan a vencida, sin importar cuánto haga que vencieron", () => {
    const paid = charge("PAID", "2020-01-01");
    const waived = charge("WAIVED", "2020-01-01");

    expect(markOverdue([paid, waived], "2026-07-15")).toEqual([]);
  });

  it("OVERDUE no se re-marca: el cron diario es idempotente", () => {
    const already = charge("OVERDUE", "2026-07-01");

    expect(markOverdue([already], "2026-07-15")).toEqual([]);
  });

  it("el vencimiento compara por calendario, también cruzando el año", () => {
    const december = charge("PENDING", "2026-12-31");

    expect(markOverdue([december], "2027-01-01")).toEqual([december.id]);
    expect(markOverdue([december], "2026-12-31")).toEqual([]);
  });

  it("lista vacía → nada que marcar", () => {
    expect(markOverdue([], "2026-07-15")).toEqual([]);
  });
});
