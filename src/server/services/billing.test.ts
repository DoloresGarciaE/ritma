import { describe, expect, it } from "vitest";

import {
  allocateGreedy,
  dropInCharge,
  generateCharges,
  isActiveInPeriod,
  markOverdue,
  money,
  recomputeChargeStatus,
  sumMoney,
  validateAllocations,
  ZERO,
  type BillingEnrollment,
  type BillingOrgConfig,
  type ChargeStatusValue,
  type Money,
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

// ─────────────────────────────────────────────────────────────────────────────
// S4 — imputaciones (RN3 + RN4): la suite más exhaustiva del proyecto. Acá se
// registra plata: un caso borde sin test no cierra el bloque (mandato S4).
// ─────────────────────────────────────────────────────────────────────────────

/** Los estados como salen de la base, para recorrer matrices completas. */
const TODAY = "2026-07-15";

function chargeOf(amount: number, status: ChargeStatusValue, dueDate: string) {
  return { amount: money(amount), status, dueDate };
}

describe("recomputeChargeStatus — RN3, la única fuente de verdad", () => {
  it("cubierta exacta → PAID; sobrecubierta (defensivo) → PAID", () => {
    const charge = chargeOf(18000, "PENDING", "2026-07-20");
    expect(recomputeChargeStatus(charge, money(18000), TODAY)).toBe("PAID");
    expect(recomputeChargeStatus(charge, money(20000), TODAY)).toBe("PAID");
  });

  it("una VENCIDA que se paga pasa DIRECTO a PAID (RN3 literal)", () => {
    const overdue = chargeOf(18000, "OVERDUE", "2026-06-10");
    expect(recomputeChargeStatus(overdue, money(18000), TODAY)).toBe("PAID");
  });

  it("plata parcial antes del vencimiento → PARTIAL", () => {
    const charge = chargeOf(18000, "PENDING", "2026-07-20");
    expect(recomputeChargeStatus(charge, money(5000), TODAY)).toBe("PARTIAL");
  });

  it("plata parcial con el vencimiento pasado → OVERDUE: el badge no disfraza la mora", () => {
    const charge = chargeOf(18000, "OVERDUE", "2026-06-10");
    expect(recomputeChargeStatus(charge, money(5000), TODAY)).toBe("OVERDUE");
    // El día exacto del vencimiento todavía no está vencida (hoy > dueDate, como RN3).
    const dueToday = chargeOf(18000, "PARTIAL", TODAY);
    expect(recomputeChargeStatus(dueToday, money(5000), TODAY)).toBe("PARTIAL");
  });

  it("sin plata → PENDING o OVERDUE según el calendario (ej.: se eliminó el pago)", () => {
    expect(recomputeChargeStatus(chargeOf(18000, "PAID", "2026-07-20"), ZERO, TODAY)).toBe(
      "PENDING",
    );
    expect(recomputeChargeStatus(chargeOf(18000, "PAID", "2026-06-10"), ZERO, TODAY)).toBe(
      "OVERDUE",
    );
  });

  it("WAIVED es un cierre: ninguna imputación lo mueve", () => {
    const waived = chargeOf(18000, "WAIVED", "2026-06-10");
    expect(recomputeChargeStatus(waived, ZERO, TODAY)).toBe("WAIVED");
    expect(recomputeChargeStatus(waived, money(18000), TODAY)).toBe("WAIVED");
  });

  it("coincide con markOverdue: recomputar hoy y correr el cron hoy dan lo mismo", () => {
    const charge = chargeOf(18000, "PENDING", "2026-07-10");
    const recomputed = recomputeChargeStatus(charge, ZERO, TODAY);
    const cronWouldMark = markOverdue(
      [{ id: "c", status: "PENDING", dueDate: "2026-07-10" }],
      TODAY,
    );
    expect(recomputed).toBe("OVERDUE");
    expect(cronWouldMark).toEqual(["c"]);
  });
});

describe("allocateGreedy — RN4: antigua-primero, en el orden recibido", () => {
  const p = (paymentId: string, remaining: number): { paymentId: string; remaining: Money } => ({
    paymentId,
    remaining: money(remaining),
  });
  const c = (chargeId: string, remaining: number): { chargeId: string; remaining: Money } => ({
    chargeId,
    remaining: money(remaining),
  });

  function totals(allocations: ReturnType<typeof allocateGreedy>) {
    return allocations.map((a) => ({ ...a, amount: a.amount.toNumber() }));
  }

  it("pago parcial: la primera cuota recibe todo y queda con remanente", () => {
    const result = allocateGreedy([p("pago", 5000)], [c("junio", 18000), c("julio", 18000)]);
    expect(totals(result)).toEqual([{ paymentId: "pago", chargeId: "junio", amount: 5000 }]);
  });

  it("un pago cubre varias cuotas: $38.000 = junio completa + julio completa", () => {
    const result = allocateGreedy([p("pago", 38000)], [c("junio", 18000), c("julio", 20000)]);
    expect(totals(result)).toEqual([
      { paymentId: "pago", chargeId: "junio", amount: 18000 },
      { paymentId: "pago", chargeId: "julio", amount: 20000 },
    ]);
  });

  it("cubre dos y deja la tercera parcial", () => {
    const result = allocateGreedy(
      [p("pago", 40000)],
      [c("mayo", 15000), c("junio", 15000), c("julio", 15000)],
    );
    expect(totals(result)).toEqual([
      { paymentId: "pago", chargeId: "mayo", amount: 15000 },
      { paymentId: "pago", chargeId: "junio", amount: 15000 },
      { paymentId: "pago", chargeId: "julio", amount: 10000 },
    ]);
  });

  it("excedente: lo que no entra en ninguna cuota NO se imputa (queda como crédito)", () => {
    const result = allocateGreedy([p("pago", 25000)], [c("julio", 18000)]);
    expect(totals(result)).toEqual([{ paymentId: "pago", chargeId: "julio", amount: 18000 }]);
    // El crédito es un derivado: pago 25.000 − imputado 18.000 = 7.000 a favor.
    const allocated = sumMoney(result.map((a) => a.amount));
    expect(money(25000).minus(allocated).toNumber()).toBe(7000);
  });

  it("respeta el orden recibido (antigua-primero lo garantiza el caller)", () => {
    const result = allocateGreedy([p("pago", 1000)], [c("febrero", 500), c("marzo", 500)]);
    expect(result[0].chargeId).toBe("febrero");
    expect(result[1].chargeId).toBe("marzo");
  });

  it("varios pagos con remanente contra varias cuotas (el caso del crédito en el cron)", () => {
    const result = allocateGreedy(
      [p("pago-viejo", 3000), p("pago-nuevo", 5000)],
      [c("agosto-arabe", 6000), c("agosto-folklore", 4000)],
    );
    expect(totals(result)).toEqual([
      { paymentId: "pago-viejo", chargeId: "agosto-arabe", amount: 3000 },
      { paymentId: "pago-nuevo", chargeId: "agosto-arabe", amount: 3000 },
      { paymentId: "pago-nuevo", chargeId: "agosto-folklore", amount: 2000 },
    ]);
  });

  it("cuotas ya cubiertas (remanente 0) y remanentes negativos defensivos se saltean", () => {
    const result = allocateGreedy(
      [p("pago", 5000)],
      [c("pagada", 0), c("rara", -100), c("julio", 18000)],
    );
    expect(totals(result)).toEqual([{ paymentId: "pago", chargeId: "julio", amount: 5000 }]);
  });

  it("sin cuotas abiertas → sin imputaciones (todo el pago es crédito); sin pagos → nada", () => {
    expect(allocateGreedy([p("pago", 5000)], [])).toEqual([]);
    expect(allocateGreedy([], [c("julio", 18000)])).toEqual([]);
  });

  it("centavos exactos: tres cuotas de $6.666,67 contra $20.000 dejan 1 centavo impago", () => {
    const result = allocateGreedy(
      [p("pago", 20000)],
      [c("a", 6666.67), c("b", 6666.67), c("c", 6666.67)],
    );
    expect(totals(result)).toEqual([
      { paymentId: "pago", chargeId: "a", amount: 6666.67 },
      { paymentId: "pago", chargeId: "b", amount: 6666.67 },
      { paymentId: "pago", chargeId: "c", amount: 6666.66 },
    ]);
    // La suma cierra EXACTA en Decimal — con floats, 6666.67 × 3 ya no daría 20000.01.
    expect(sumMoney(result.map((a) => a.amount)).toNumber()).toBe(20000);
  });

  it("$10.000,49 contra una cuota de $10.000,50: queda PARTIAL por un centavo", () => {
    const result = allocateGreedy([p("pago", 10000.49)], [c("julio", 10000.5)]);
    expect(totals(result)).toEqual([{ paymentId: "pago", chargeId: "julio", amount: 10000.49 }]);
  });
});

describe("validateAllocations — invariantes de la edición manual (HU4.3)", () => {
  const remaining = new Map([
    ["junio", money(18000)],
    ["julio", money(20000)],
  ]);

  it("una imputación válida pasa (incluso dejando excedente como crédito)", () => {
    expect(
      validateAllocations(
        money(30000),
        [
          { chargeId: "junio", amount: money(18000) },
          { chargeId: "julio", amount: money(5000) },
        ],
        remaining,
      ),
    ).toBeNull();
  });

  it("la suma de imputaciones nunca supera el monto del pago", () => {
    expect(
      validateAllocations(
        money(20000),
        [
          { chargeId: "junio", amount: money(18000) },
          { chargeId: "julio", amount: money(5000) },
        ],
        remaining,
      ),
    ).toMatch(/suman más que el pago/);
  });

  it("una imputación nunca supera el remanente de su cuota", () => {
    expect(
      validateAllocations(
        money(50000),
        [{ chargeId: "junio", amount: money(18000.01) }],
        remaining,
      ),
    ).toMatch(/supera lo que falta/);
  });

  it("cuota desconocida (ajena, de otro alumno o ya cerrada) rechaza", () => {
    expect(
      validateAllocations(money(5000), [{ chargeId: "hackeada", amount: money(1) }], remaining),
    ).toMatch(/no existe o no es de este alumno/);
  });

  it("cero, negativo y duplicados rechazan", () => {
    expect(
      validateAllocations(money(5000), [{ chargeId: "junio", amount: ZERO }], remaining),
    ).toMatch(/mayor a cero/);
    expect(
      validateAllocations(money(5000), [{ chargeId: "junio", amount: money(-1) }], remaining),
    ).toMatch(/mayor a cero/);
    expect(
      validateAllocations(
        money(5000),
        [
          { chargeId: "junio", amount: money(1000) },
          { chargeId: "junio", amount: money(1000) },
        ],
        remaining,
      ),
    ).toMatch(/misma cuota/);
  });
});
