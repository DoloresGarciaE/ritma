import { afterEach, describe, expect, it, vi } from "vitest";

import { mondayOf } from "@/lib/dates";
import { db } from "@/lib/db";
import { sumMoney } from "@/server/services/billing";
import { debtorsForPeriod } from "@/server/services/charges";
import { dashboardMetrics } from "@/server/services/metrics";
import { createPayment } from "@/server/services/payments";
import { weekData } from "@/server/services/sessions";

import { makeCharge, makeEnrollment, makeGroup, makeOrg, makeSlot, makeStudent } from "./factories";

/**
 * Métricas del dashboard (HU7.1, S6) contra Postgres real. La regla de la sesión: cada
 * número se COTEJA contra su servicio de origen — `debtorsForPeriod` (Cobranzas),
 * las imputaciones que escribe `createPayment` (S4) y `weekData` (agenda) — para que el
 * dashboard no pueda divergir de las pantallas que detalla.
 */

const NOW = new Date("2026-08-12T15:00:00Z"); // miércoles 12/08, 12:00 en Buenos Aires
const TODAY = "2026-08-12";
const CUR = "2026-08";

function freezeClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
}

afterEach(() => {
  vi.useRealTimers();
});

/**
 * El mes a mitad de camino: dos alumnas con cuota de agosto; Sofía además arrastra julio
 * VENCIDA y paga $20.000 (createPayment imputa REAL: $18.000 saldan julio, $2.000 van a
 * agosto). El grupo tiene clase los miércoles (hoy) y los sábados.
 */
async function makeMonth() {
  const org = await makeOrg("Danzas Malena");
  const group = await makeGroup(org.id, "Árabe inicial");
  const wednesday = await makeSlot(org.id, group.id, { weekday: 3, startTime: "18:00" });
  await makeSlot(org.id, group.id, { weekday: 6, startTime: "10:00" });

  const sofia = await makeStudent(org.id, "Sofía Herrera");
  const carla = await makeStudent(org.id, "Carla Domínguez");
  const sofiaEnrollment = await makeEnrollment(org.id, sofia.id, group.id);
  const carlaEnrollment = await makeEnrollment(org.id, carla.id, group.id);

  await makeCharge(org.id, sofiaEnrollment.id, {
    period: "2026-07",
    dueDate: "2026-07-10",
    status: "OVERDUE",
  });
  const sofiaAug = await makeCharge(org.id, sofiaEnrollment.id, {
    period: CUR,
    dueDate: "2026-08-10",
    status: "OVERDUE",
  });
  const carlaAug = await makeCharge(org.id, carlaEnrollment.id, {
    period: CUR,
    dueDate: "2026-08-20",
    status: "PENDING",
  });

  await createPayment(
    org.id,
    { kind: "all" },
    {
      studentId: sofia.id,
      amount: 20000,
      method: "TRANSFER",
      paidAt: TODAY,
    },
  );

  return { org, group, wednesday, sofiaAug, carlaAug };
}

describe("dashboardMetrics (HU7.1)", () => {
  it("cobrado del mes = imputaciones DEL PERÍODO, no el total del pago", async () => {
    freezeClock();
    const { org } = await makeMonth();

    const metrics = await dashboardMetrics(org.id, { kind: "all" });

    // El pago fue de $20.000, pero $18.000 saldaron JULIO: agosto cobró $2.000.
    expect(metrics.period).toBe(CUR);
    expect(metrics.collected).toBe(2000);

    // Coteja contra lo que S4 escribió de verdad, sumado por el motor.
    const allocations = await db.paymentAllocation.findMany({
      where: { orgId: org.id, charge: { period: CUR } },
      select: { amount: true },
    });
    expect(metrics.collected).toBe(sumMoney(allocations.map((a) => a.amount)).toNumber());
  });

  it("pendiente y deudores = EXACTAMENTE lo que muestra Cobranzas (debtorsForPeriod)", async () => {
    freezeClock();
    const { org } = await makeMonth();

    const metrics = await dashboardMetrics(org.id, { kind: "all" });
    const cobranzas = await debtorsForPeriod(org.id, { kind: "all" }, CUR);

    // Sofía debe $16.000 de agosto (18.000 − 2.000) y Carla $18.000: $34.000 en 2 cuotas.
    expect(metrics.pending).toBe(34000);
    expect(metrics.pending).toBe(cobranzas.total);
    expect(metrics.pendingCharges).toBe(2);
    expect(metrics.pendingCharges).toBe(cobranzas.debtors.length);
    expect(metrics.debtors).toBe(2);
    expect(metrics.debtors).toBe(cobranzas.students.length);
  });

  it("la deuda de OTRO período no ensucia el mes: julio quedó saldado y no aparece", async () => {
    freezeClock();
    const { org } = await makeMonth();

    const metrics = await dashboardMetrics(org.id, { kind: "all" });

    // El pendiente es solo agosto; julio (pagada) no suma ni acá ni en Cobranzas.
    expect(metrics.pending).toBe((await debtorsForPeriod(org.id, { kind: "all" }, CUR)).total);
    expect((await debtorsForPeriod(org.id, { kind: "all" }, "2026-07")).total).toBe(0);
  });

  it("clases de hoy = lo que la agenda muestra HOY (weekData filtrado al día)", async () => {
    freezeClock();
    const { org, wednesday } = await makeMonth();

    const metrics = await dashboardMetrics(org.id, { kind: "all" });

    // Hoy es miércoles: la de las 18:00, no la del sábado.
    expect(metrics.today).toBe(TODAY);
    expect(metrics.todayClasses).toHaveLength(1);
    expect(metrics.todayClasses[0].slotId).toBe(wednesday.id);
    expect(metrics.todayClasses[0].startTime).toBe("18:00");

    // Coteja contra la agenda real de la semana.
    const week = await weekData(org.id, { kind: "all" }, mondayOf(TODAY));
    expect(metrics.todayClasses).toEqual(week.occurrences.filter((o) => o.date === TODAY));
  });

  it("cambiar de organización cambia el dashboard ENTERO (decisión S6, selector de Más)", async () => {
    freezeClock();
    const { org } = await makeMonth();
    const otra = await makeOrg("Estudio Compás");

    const [deMalena, deCompas] = [
      await dashboardMetrics(org.id, { kind: "all" }),
      await dashboardMetrics(otra.id, { kind: "all" }),
    ];

    expect(deMalena.pending).toBe(34000);
    expect(deCompas).toMatchObject({
      collected: 0,
      pending: 0,
      pendingCharges: 0,
      debtors: 0,
      todayClasses: [],
    });
  });
});
