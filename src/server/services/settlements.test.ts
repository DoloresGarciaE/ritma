import { describe, expect, it } from "vitest";

import { money } from "./billing";
import {
  computeSettlement,
  SettlementRuleError,
  type AgreementSlice,
  type SettlementPayment,
} from "./settlements";

/**
 * La suite INSIGNIA del proyecto (S9, RN6 + RN6-bis): la fórmula de liquidación, caso
 * por caso, en Decimal puro. El Plan §13 lo dice sin vueltas: un cálculo de liquidación
 * con errores mina la confianza — acá está todo el rigor. La mitad con base (quién entra
 * a B y C desde imputaciones reales, congelado, aislamiento) vive en
 * tests/settlements.test.ts.
 *
 * Convenciones del motor: `gross` (B) = imputaciones a cuotas del profe de pagos del
 * período; `studioShare` (R) = B×r POR TRAMO de vigencia (RN6-bis: cada pago liquida con
 * el acuerdo vigente a su paidAt); `collectedByTeacher` (C) = el monto COMPLETO de los
 * pagos que el profe cobró en mano (decisión de sesión: la caja cuadra siempre);
 * `netToTeacher` (N) = (B − R) − C, puede ser negativo.
 */

const pay = (extra: Partial<SettlementPayment> = {}): SettlementPayment => ({
  paymentId: "pago",
  paidAt: "2026-07-10",
  amount: money(10000),
  allocatedToTeacher: money(10000),
  collectedByTeacher: false,
  ...extra,
});

const pct = (validFrom: string, percent: number): AgreementSlice => ({
  validFrom,
  studioPercent: money(percent),
});

const THIRTY = [pct("2026-01-01", 30)];

describe("computeSettlement — la fórmula RN6", () => {
  it("reproduce el ejemplo numérico del plan, literal: B=500.000, r=30%, C=200.000 → N=150.000", () => {
    const result = computeSettlement(
      [
        pay({ paymentId: "p1", amount: money(300000), allocatedToTeacher: money(300000) }),
        pay({
          paymentId: "p2",
          amount: money(200000),
          allocatedToTeacher: money(200000),
          collectedByTeacher: true,
        }),
      ],
      THIRTY,
    );

    expect(result.gross.toNumber()).toBe(500000);
    expect(result.studioShare.toNumber()).toBe(150000);
    expect(result.collectedByTeacher.toNumber()).toBe(200000);
    expect(result.netToTeacher.toNumber()).toBe(150000); // a favor del profe
  });

  it("cobro en mano MAYOR al neto: N negativo (el profe le debe al estudio)", () => {
    const result = computeSettlement(
      [
        pay({ paymentId: "p1", amount: money(100000), allocatedToTeacher: money(100000) }),
        pay({
          paymentId: "p2",
          amount: money(80000),
          allocatedToTeacher: money(0),
          collectedByTeacher: true,
        }),
      ],
      THIRTY,
    );

    // B=100.000, R=30.000, C=80.000 → N = 70.000 − 80.000 = −10.000.
    expect(result.netToTeacher.toNumber()).toBe(-10000);
  });

  it("período sin pagos: todo en cero, sin tramos", () => {
    const result = computeSettlement([], THIRTY);

    expect(result.gross.toNumber()).toBe(0);
    expect(result.studioShare.toNumber()).toBe(0);
    expect(result.collectedByTeacher.toNumber()).toBe(0);
    expect(result.netToTeacher.toNumber()).toBe(0);
    expect(result.tranches).toEqual([]);
  });

  it("cambio de porcentaje a mitad de mes: dos tramos que suman exacto (RN6-bis)", () => {
    const result = computeSettlement(
      [
        pay({ paymentId: "antes", paidAt: "2026-07-10" }),
        // El MISMO día del validFrom ya rige el acuerdo nuevo.
        pay({ paymentId: "el-dia", paidAt: "2026-07-16" }),
        pay({ paymentId: "despues", paidAt: "2026-07-20" }),
      ],
      [pct("2026-07-01", 20), pct("2026-07-16", 30)],
    );

    expect(
      result.tranches.map((t) => [t.validFrom, t.gross.toNumber(), t.share.toNumber()]),
    ).toEqual([
      ["2026-07-01", 10000, 2000],
      ["2026-07-16", 20000, 6000],
    ]);
    expect(result.gross.toNumber()).toBe(30000);
    // La suma de los tramos ES el total: nada se calcula dos veces.
    expect(result.studioShare.toNumber()).toBe(8000);
    expect(result.netToTeacher.toNumber()).toBe(22000);
  });

  it("pago multi-cuota repartido entre profes: solo entra a B la parte imputada a ESTE profe", () => {
    // Un pago de $30.000 del que $10.000 fueron a cuotas de este profe (el resto es de
    // otro): B toma los $10.000; el monto completo NO aparece porque no lo cobró él.
    const result = computeSettlement(
      [pay({ amount: money(30000), allocatedToTeacher: money(10000) })],
      THIRTY,
    );

    expect(result.gross.toNumber()).toBe(10000);
    expect(result.studioShare.toNumber()).toBe(3000);
    expect(result.collectedByTeacher.toNumber()).toBe(0);
    expect(result.netToTeacher.toNumber()).toBe(7000);
  });

  it("decisión de sesión: C es el pago COMPLETO cobrado en mano, no solo lo imputado", () => {
    // El caso numérico de la pregunta: cobró $20.000, se imputaron $17.000 a su cuota y
    // $3.000 quedaron como saldo a favor de la alumna.
    const result = computeSettlement(
      [
        pay({
          amount: money(20000),
          allocatedToTeacher: money(17000),
          collectedByTeacher: true,
        }),
      ],
      THIRTY,
    );

    expect(result.gross.toNumber()).toBe(17000);
    expect(result.studioShare.toNumber()).toBe(5100);
    expect(result.collectedByTeacher.toNumber()).toBe(20000);
    // N = (17.000 − 5.100) − 20.000 = −8.100: le debe al estudio, que a su vez le debe
    // los $3.000 a la alumna. La caja cuadra.
    expect(result.netToTeacher.toNumber()).toBe(-8100);
  });

  it("un pago cobrado en mano SIN imputaciones al profe igual entra a C (plata es plata)", () => {
    const result = computeSettlement(
      [
        pay({
          amount: money(5000),
          allocatedToTeacher: money(0),
          collectedByTeacher: true,
        }),
      ],
      THIRTY,
    );

    expect(result.gross.toNumber()).toBe(0);
    expect(result.collectedByTeacher.toNumber()).toBe(5000);
    expect(result.netToTeacher.toNumber()).toBe(-5000);
  });

  it("redondeo Decimal sin pérdida de centavos: la suma de los tramos ES el total", () => {
    // 33,33% sobre montos con centavos: cada tramo redondea a 2 decimales y el total es
    // la suma de las partes — jamás un redondeo del total que no cuadre con el detalle.
    const result = computeSettlement(
      [
        pay({
          paymentId: "a",
          paidAt: "2026-07-05",
          amount: money(100.01),
          allocatedToTeacher: money(100.01),
        }),
        pay({
          paymentId: "b",
          paidAt: "2026-07-06",
          amount: money(0.05),
          allocatedToTeacher: money(0.05),
        }),
        pay({
          paymentId: "c",
          paidAt: "2026-07-20",
          amount: money(0.07),
          allocatedToTeacher: money(0.07),
        }),
      ],
      [pct("2026-07-01", 33.33), pct("2026-07-15", 33.33)],
    );

    // Tramo 1: 100,06 × 33,33% = 33,349998 → 33,35. Tramo 2: 0,07 × 33,33% = 0,023331 → 0,02.
    expect(result.tranches.map((t) => t.share.toNumber())).toEqual([33.35, 0.02]);
    expect(result.studioShare.toNumber()).toBe(33.37);
    const sumOfParts = result.tranches.reduce((acc, t) => acc + t.share.toNumber(), 0);
    expect(result.studioShare.toNumber()).toBe(Number(sumOfParts.toFixed(2)));
    // N también queda en 2 decimales exactos: 100,13 − 33,37 = 66,76.
    expect(result.netToTeacher.toNumber()).toBe(66.76);
  });

  it("un pago ANTERIOR al primer acuerdo corta con error que nombra la fecha", () => {
    expect(() =>
      computeSettlement([pay({ paidAt: "2026-06-15" })], [pct("2026-07-01", 30)]),
    ).toThrow(SettlementRuleError);
    expect(() =>
      computeSettlement([pay({ paidAt: "2026-06-15" })], [pct("2026-07-01", 30)]),
    ).toThrow("Sin acuerdo vigente al 2026-06-15");
  });

  it("sin ningún acuerdo no hay liquidación posible (aunque no haya pagos que liquidar)", () => {
    expect(() => computeSettlement([pay()], [])).toThrow(SettlementRuleError);
  });

  it("acuerdos desordenados se ordenan solos: el vigente es el último validFrom ≤ paidAt", () => {
    const result = computeSettlement(
      [pay({ paidAt: "2026-07-20" })],
      [pct("2026-07-16", 30), pct("2026-01-01", 10), pct("2026-07-01", 20)],
    );

    expect(result.studioShare.toNumber()).toBe(3000); // 30%, no 10 ni 20
    expect(result.tranches).toHaveLength(1);
    expect(result.tranches[0].validFrom).toBe("2026-07-16");
  });
});
