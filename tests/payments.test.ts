import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { ChargeRuleError, updateChargeAmount, waiveCharge } from "@/server/services/charges";
import { createEnrollment } from "@/server/services/enrollments";
import {
  applyStudentCredit,
  createPayment,
  deletePayment,
  paymentContext,
  PaymentRuleError,
} from "@/server/services/payments";

import {
  makeCharge,
  makeEnrollment,
  makeGroup,
  makeOrg,
  makePayment,
  makeStudent,
} from "./factories";

/**
 * Pagos e imputaciones contra Postgres real (HU4.3–HU4.4, RN3–RN4): la capa de datos que
 * el motor puro no puede probar solo — transacción o nada, referencias cruzadas, el
 * recálculo de estados en la base y el crédito de punta a punta.
 *
 * Se fakea solo `Date` (los timers reales quedan para Prisma/pg): "hoy" tiene que ser
 * determinístico para los estados.
 */

const NOW = new Date("2026-07-15T12:00:00Z"); // 09:00 en Buenos Aires

function freezeClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
}

afterEach(() => {
  vi.useRealTimers();
});

/** Alumno con inscripción y dos cuotas: junio VENCIDA y julio PENDIENTE, $18.000 c/u. */
async function makeDebtor() {
  const org = await makeOrg("Danzas Malena");
  const student = await makeStudent(org.id, "Sofía Herrera");
  const group = await makeGroup(org.id, "Árabe inicial");
  const enrollment = await makeEnrollment(org.id, student.id, group.id);
  const june = await makeCharge(org.id, enrollment.id, {
    period: "2026-06",
    dueDate: "2026-06-10",
    status: "OVERDUE",
  });
  const july = await makeCharge(org.id, enrollment.id, {
    period: "2026-07",
    dueDate: "2026-07-20",
    status: "PENDING",
  });
  return { org, student, group, enrollment, june, july };
}

const statusOf = async (id: string) =>
  (await db.charge.findUniqueOrThrow({ where: { id } })).status;

describe("createPayment — imputación automática (RN4)", () => {
  it("paga la más antigua primero: la VENCIDA de junio pasa DIRECTO a PAID (RN3)", async () => {
    freezeClock();
    const { org, student, june, july } = await makeDebtor();

    const { id } = await createPayment(org.id, {
      studentId: student.id,
      amount: 18000,
      method: "CASH",
      paidAt: "2026-07-15",
    });

    expect(await statusOf(june.id)).toBe("PAID");
    expect(await statusOf(july.id)).toBe("PENDING");

    const allocations = await db.paymentAllocation.findMany({ where: { paymentId: id } });
    expect(allocations).toHaveLength(1);
    expect(allocations[0].chargeId).toBe(june.id);
    expect(allocations[0].amount.toNumber()).toBe(18000);
    expect(allocations[0].orgId).toBe(org.id);
  });

  it("pago parcial: la cuota queda PARTIAL (no vencida) si el vencimiento no pasó", async () => {
    freezeClock();
    const { org, student, june, july } = await makeDebtor();
    // Junio se exoneró: la plata va a julio, que vence el 20 (hoy es 15).
    await db.charge.update({ where: { id: june.id }, data: { status: "WAIVED" } });

    await createPayment(org.id, {
      studentId: student.id,
      amount: 5000,
      method: "TRANSFER",
      paidAt: "2026-07-15",
    });

    expect(await statusOf(july.id)).toBe("PARTIAL");
  });

  it("plata parcial sobre una VENCIDA: sigue OVERDUE — el badge no disfraza la mora", async () => {
    freezeClock();
    const { org, student, june } = await makeDebtor();

    await createPayment(org.id, {
      studentId: student.id,
      amount: 5000,
      method: "CASH",
      paidAt: "2026-07-15",
    });

    expect(await statusOf(june.id)).toBe("OVERDUE");
  });

  it("un pago cubre varias cuotas: $38.000 deja junio y julio en PAID", async () => {
    freezeClock();
    const { org, student, june, july } = await makeDebtor();

    const { id } = await createPayment(org.id, {
      studentId: student.id,
      amount: 38000,
      method: "CASH",
      paidAt: "2026-07-15",
    });

    expect(await statusOf(june.id)).toBe("PAID");
    expect(await statusOf(july.id)).toBe("PAID");
    expect(await db.paymentAllocation.count({ where: { paymentId: id } })).toBe(2);
    // El pago excedió la deuda en 2.000: quedó como crédito, NO imputado.
    const context = await paymentContext(org.id, student.id);
    expect(context.credit).toBe(2000);
    expect(context.debt).toBe(0);
  });

  it("el excedente queda como saldo a favor derivado, visible en el contexto", async () => {
    freezeClock();
    const { org, student, june, july } = await makeDebtor();
    await db.charge.update({ where: { id: july.id }, data: { status: "WAIVED" } });

    await createPayment(org.id, {
      studentId: student.id,
      amount: 25000,
      method: "CASH",
      paidAt: "2026-07-15",
    });

    expect(await statusOf(june.id)).toBe("PAID");
    const context = await paymentContext(org.id, student.id);
    expect(context.credit).toBe(7000);
  });

  it("copia la moneda de la org y genera un receiptToken opaco y distinto por pago", async () => {
    freezeClock();
    const { org, student } = await makeDebtor();
    await db.organization.update({ where: { id: org.id }, data: { currency: "UYU" } });

    const first = await createPayment(org.id, {
      studentId: student.id,
      amount: 1000,
      method: "OTHER",
      paidAt: "2026-07-15",
    });
    const second = await createPayment(org.id, {
      studentId: student.id,
      amount: 1000,
      method: "OTHER",
      paidAt: "2026-07-15",
    });

    const rows = await db.payment.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(rows.every((p) => p.currency === "UYU")).toBe(true);
    expect(rows[0].receiptToken).not.toBe(rows[1].receiptToken);
    expect(rows.every((p) => p.receiptToken.length >= 32)).toBe(true);
    expect(rows.every((p) => p.receivedBy === "STUDIO")).toBe(true); // el default
  });

  it("un studentId ajeno corta ANTES de escribir; un monto en cero también", async () => {
    freezeClock();
    const { org } = await makeDebtor();
    const other = await makeOrg("Estudio B");
    const foreign = await makeStudent(other.id, "Malena Ríos");

    await expect(
      createPayment(org.id, {
        studentId: foreign.id,
        amount: 1000,
        method: "CASH",
        paidAt: "2026-07-15",
      }),
    ).rejects.toThrow(/no pertenece/);

    const { student } = { student: foreign };
    void student;
    await expect(
      createPayment(org.id, {
        studentId: (await db.student.findFirstOrThrow({ where: { orgId: org.id } })).id,
        amount: 0,
        method: "CASH",
        paidAt: "2026-07-15",
      }),
    ).rejects.toThrow(PaymentRuleError);

    expect(await db.payment.count()).toBe(0);
  });
});

describe("createPayment — imputación manual (HU4.4)", () => {
  it("respeta la elección: pagar julio y dejar la vencida de junio como está", async () => {
    freezeClock();
    const { org, student, june, july } = await makeDebtor();

    await createPayment(org.id, {
      studentId: student.id,
      amount: 18000,
      method: "CASH",
      paidAt: "2026-07-15",
      allocations: [{ chargeId: july.id, amount: 18000 }],
    });

    expect(await statusOf(july.id)).toBe("PAID");
    expect(await statusOf(june.id)).toBe("OVERDUE");
  });

  it("imputar de más que el remanente: PaymentRuleError y NADA queda escrito (transacción)", async () => {
    freezeClock();
    const { org, student, june } = await makeDebtor();

    await expect(
      createPayment(org.id, {
        studentId: student.id,
        amount: 50000,
        method: "CASH",
        paidAt: "2026-07-15",
        allocations: [{ chargeId: june.id, amount: 18000.01 }],
      }),
    ).rejects.toThrow(PaymentRuleError);

    expect(await db.payment.count()).toBe(0);
    expect(await db.paymentAllocation.count()).toBe(0);
    expect(await statusOf(june.id)).toBe("OVERDUE");
  });

  it("una cuota de OTRO alumno (o de otra org) no se puede imputar", async () => {
    freezeClock();
    const { org, student } = await makeDebtor();
    const otherStudent = await makeStudent(org.id, "Iñaki Gómez");
    const otherGroup = await makeGroup(org.id, "Otro grupo");
    const otherEnrollment = await makeEnrollment(org.id, otherStudent.id, otherGroup.id);
    const foreignCharge = await makeCharge(org.id, otherEnrollment.id, { period: "2026-07" });

    await expect(
      createPayment(org.id, {
        studentId: student.id,
        amount: 18000,
        method: "CASH",
        paidAt: "2026-07-15",
        allocations: [{ chargeId: foreignCharge.id, amount: 18000 }],
      }),
    ).rejects.toThrow(/no existe o no es de este alumno/);

    expect(await db.payment.count()).toBe(0);
  });

  it("las imputaciones no pueden sumar más que el pago", async () => {
    freezeClock();
    const { org, student, june, july } = await makeDebtor();

    await expect(
      createPayment(org.id, {
        studentId: student.id,
        amount: 20000,
        method: "CASH",
        paidAt: "2026-07-15",
        allocations: [
          { chargeId: june.id, amount: 18000 },
          { chargeId: july.id, amount: 5000 },
        ],
      }),
    ).rejects.toThrow(/suman más que el pago/);
  });
});

describe("deletePayment — propuesta RN12", () => {
  it("borra pago e imputaciones y los estados VUELVEN solos por el calendario", async () => {
    freezeClock();
    const { org, student, june, july } = await makeDebtor();
    const { id } = await createPayment(org.id, {
      studentId: student.id,
      amount: 38000,
      method: "CASH",
      paidAt: "2026-07-15",
    });
    expect(await statusOf(june.id)).toBe("PAID");

    await deletePayment(org.id, id);

    expect(await db.payment.count()).toBe(0);
    expect(await db.paymentAllocation.count()).toBe(0);
    // Junio venció el 10 y julio vence el 20: cada una vuelve a SU estado.
    expect(await statusOf(june.id)).toBe("OVERDUE");
    expect(await statusOf(july.id)).toBe("PENDING");
  });

  it("un pago ajeno no se puede eliminar", async () => {
    freezeClock();
    const { org } = await makeDebtor();
    const other = await makeOrg("Estudio B");
    const foreignStudent = await makeStudent(other.id, "Malena Ríos");
    const foreign = await makePayment(other.id, foreignStudent.id);

    await expect(deletePayment(org.id, foreign.id)).rejects.toThrow(/no pertenece/);
    expect(await db.payment.count({ where: { orgId: other.id } })).toBe(1);
  });
});

describe("saldo a favor de punta a punta (RN4)", () => {
  it("el crédito existente se consume al inscribir (la cuota inicial es una cuota generada)", async () => {
    freezeClock();
    const org = await makeOrg("Danzas Malena");
    const student = await makeStudent(org.id, "Valentina Ruiz");
    const group = await makeGroup(org.id, "Árabe inicial", { defaultPrice: 18000 });

    // Pagó por adelantado sin deber nada: crédito puro.
    await createPayment(org.id, {
      studentId: student.id,
      amount: 20000,
      method: "TRANSFER",
      paidAt: "2026-07-10",
    });
    expect((await paymentContext(org.id, student.id)).credit).toBe(20000);

    // Se inscribe: nace la cuota de julio ($18.000) y el crédito la cubre solo.
    await createEnrollment(org.id, {
      studentId: student.id,
      groupId: group.id,
      plan: "MONTHLY",
      price: 18000,
      startDate: "2026-07-15",
    });

    const charge = await db.charge.findFirstOrThrow({
      where: { enrollment: { studentId: student.id } },
    });
    expect(charge.status).toBe("PAID");
    const context = await paymentContext(org.id, student.id);
    expect(context.credit).toBe(2000);
    expect(context.debt).toBe(0);
  });

  it("applyStudentCredit es idempotente: sin crédito o sin cuotas abiertas, no escribe", async () => {
    freezeClock();
    const { org, student } = await makeDebtor();

    // Sin pagos: nada que aplicar.
    expect((await applyStudentCredit(org.id, student.id, "2026-07-15")).applied).toBe(0);

    // Con pago que ya se imputó completo: tampoco.
    await createPayment(org.id, {
      studentId: student.id,
      amount: 18000,
      method: "CASH",
      paidAt: "2026-07-15",
    });
    const before = await db.paymentAllocation.count();
    expect((await applyStudentCredit(org.id, student.id, "2026-07-15")).applied).toBe(0);
    expect(await db.paymentAllocation.count()).toBe(before);
  });
});

describe("interacciones con cuotas (S3 + S4)", () => {
  it("editar el monto por debajo de lo ya pagado rechaza; igualarlo la deja PAID", async () => {
    freezeClock();
    const { org, student, june } = await makeDebtor();
    await createPayment(org.id, {
      studentId: student.id,
      amount: 5000,
      method: "CASH",
      paidAt: "2026-07-15",
    });
    expect(await statusOf(june.id)).toBe("OVERDUE"); // parcial vencida

    await expect(updateChargeAmount(org.id, june.id, 4000)).rejects.toThrow(ChargeRuleError);

    await updateChargeAmount(org.id, june.id, 5000);
    expect(await statusOf(june.id)).toBe("PAID");
  });

  it("una cuota con pagos imputados no se exonera (primero se elimina el pago)", async () => {
    freezeClock();
    const { org, student, june } = await makeDebtor();
    await createPayment(org.id, {
      studentId: student.id,
      amount: 5000,
      method: "CASH",
      paidAt: "2026-07-15",
    });

    await expect(waiveCharge(org.id, june.id)).rejects.toThrow(/pagos imputados/);
    expect(await statusOf(june.id)).toBe("OVERDUE");
  });
});
