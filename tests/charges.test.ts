import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import {
  ChargeRuleError,
  debtorsForPeriod,
  listChargesForStudent,
  updateChargeAmount,
  waiveCharge,
} from "@/server/services/charges";

import { makeCharge, makeEnrollment, makeGroup, makeOrg, makeStudent } from "./factories";

/**
 * Los servicios de cuotas contra Postgres real: estado de cuenta, deudores por período
 * (con el total sumado en Decimal) y las dos mutaciones manuales con sus reglas de
 * estado (RN2/RN3). El aislamiento org×org ya está en isolation.test.ts; acá se prueba
 * la lógica.
 *
 * El reloj se congela (solo `Date`): desde S4, editar un monto RECOMPUTA el estado con
 * el "hoy" de la org — con el reloj real, los estados sembrados quedarían viejos.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-05T12:00:00Z")); // antes del vencimiento default (10)
});

afterEach(() => {
  vi.useRealTimers();
});

async function makeCharged(orgName = "Danzas Malena") {
  const org = await makeOrg(orgName);
  const student = await makeStudent(org.id, "Sofía Herrera");
  const group = await makeGroup(org.id, "Árabe inicial");
  const enrollment = await makeEnrollment(org.id, student.id, group.id);
  return { org, student, group, enrollment };
}

describe("listChargesForStudent", () => {
  it("todas las cuotas del alumno con su grupo, las más nuevas primero, montos en number", async () => {
    const { org, student, group, enrollment } = await makeCharged();
    const otherGroup = await makeGroup(org.id, "Folklore adultos");
    const otherEnrollment = await makeEnrollment(org.id, student.id, otherGroup.id);
    await makeCharge(org.id, enrollment.id, { period: "2026-06", status: "OVERDUE" });
    await makeCharge(org.id, enrollment.id, { period: "2026-07", amount: 20000 });
    await makeCharge(org.id, otherEnrollment.id, { period: "2026-07", status: "WAIVED" });

    // Cuotas de OTRO alumno de la misma org: no se cuelan en la ficha.
    const otherStudent = await makeStudent(org.id, "Iñaki Gómez");
    const foreignEnrollment = await makeEnrollment(org.id, otherStudent.id, group.id);
    await makeCharge(org.id, foreignEnrollment.id, { period: "2026-07" });

    const list = await listChargesForStudent(org.id, student.id);

    expect(list).toHaveLength(3);
    expect(list.map((c) => c.period)).toEqual(["2026-07", "2026-07", "2026-06"]);
    const groupNames = list.map((c) => c.group.name);
    expect(groupNames.filter((n) => n === "Árabe inicial")).toHaveLength(2);
    expect(groupNames.filter((n) => n === "Folklore adultos")).toHaveLength(1);
    expect(list.find((c) => c.amount === 20000)).toBeTruthy();
    expect(list[2].status).toBe("OVERDUE");
    expect(list[2].dueDate).toBe("2026-06-10");
  });
});

describe("debtorsForPeriod", () => {
  it("solo las impagas DEL período, una fila por cuota, con el total en Decimal", async () => {
    const { org, student, group, enrollment } = await makeCharged();

    // El mismo alumno en un segundo grupo: dos filas, cada una con su concepto.
    const otherGroup = await makeGroup(org.id, "Folklore adultos");
    const secondEnrollment = await makeEnrollment(org.id, student.id, otherGroup.id);

    await makeCharge(org.id, enrollment.id, { period: "2026-07", amount: 18000 });
    await makeCharge(org.id, secondEnrollment.id, {
      period: "2026-07",
      amount: 15000,
      status: "OVERDUE",
    });
    // Ruido que NO debe aparecer: otro período, una pagada y una exonerada.
    await makeCharge(org.id, enrollment.id, { period: "2026-06", status: "PAID" });
    const waivedEnrollment = await makeEnrollment(
      org.id,
      (await makeStudent(org.id, "Becada")).id,
      group.id,
    );
    await makeCharge(org.id, waivedEnrollment.id, { period: "2026-07", status: "WAIVED" });

    const { total, debtors } = await debtorsForPeriod(org.id, "2026-07");

    expect(debtors).toHaveLength(2);
    expect(total).toBe(33000);
    expect(debtors.map((d) => d.group.name)).toEqual(["Árabe inicial", "Folklore adultos"]);
    expect(debtors.every((d) => d.student.name === "Sofía Herrera")).toBe(true);
  });

  it("filtra por grupo cuando se lo piden", async () => {
    const { org, student, enrollment } = await makeCharged();
    const otherGroup = await makeGroup(org.id, "Folklore adultos");
    const otherEnrollment = await makeEnrollment(org.id, student.id, otherGroup.id);
    await makeCharge(org.id, enrollment.id, { period: "2026-07" });
    await makeCharge(org.id, otherEnrollment.id, { period: "2026-07", amount: 15000 });

    const { total, debtors } = await debtorsForPeriod(org.id, "2026-07", {
      groupId: otherGroup.id,
    });

    expect(debtors).toHaveLength(1);
    expect(debtors[0].group.name).toBe("Folklore adultos");
    expect(total).toBe(15000);
  });

  it("sin deuda en el período → lista vacía y total 0 (el vacío feliz de §3.10)", async () => {
    const { org, enrollment } = await makeCharged();
    await makeCharge(org.id, enrollment.id, { period: "2026-07", status: "PAID" });

    const { total, debtors } = await debtorsForPeriod(org.id, "2026-07");

    expect(debtors).toEqual([]);
    expect(total).toBe(0);
  });

  it("ordena por alumno (searchName: Álvarez no se va al final)", async () => {
    const { org, group } = await makeCharged();
    const alvarez = await makeStudent(org.id, "Ángela Álvarez");
    const zapata = await makeStudent(org.id, "Zoe Zapata");
    const ea = await makeEnrollment(org.id, alvarez.id, group.id);
    const ez = await makeEnrollment(org.id, zapata.id, group.id);
    await makeCharge(org.id, ez.id, { period: "2026-07" });
    await makeCharge(org.id, ea.id, { period: "2026-07" });

    const { debtors } = await debtorsForPeriod(org.id, "2026-07");

    expect(debtors.map((d) => d.student.name)).toEqual(["Ángela Álvarez", "Zoe Zapata"]);
  });
});

describe("updateChargeAmount — RN2", () => {
  it("edita una PENDING y una OVERDUE; el resto de la cuota no se toca", async () => {
    const { org, enrollment } = await makeCharged();
    const pending = await makeCharge(org.id, enrollment.id, { period: "2026-07" });
    const overdue = await makeCharge(org.id, enrollment.id, {
      period: "2026-06",
      status: "OVERDUE",
    });

    await updateChargeAmount(org.id, pending.id, 9000);
    await updateChargeAmount(org.id, overdue.id, 12000);

    const after = await db.charge.findUniqueOrThrow({ where: { id: pending.id } });
    expect(after.amount.toNumber()).toBe(9000);
    expect(after.status).toBe("PENDING");
    expect((await db.charge.findUniqueOrThrow({ where: { id: overdue.id } })).status).toBe(
      "OVERDUE",
    );
  });

  it("una pagada o exonerada NO se edita (ChargeRuleError), y el monto queda intacto", async () => {
    const { org, enrollment } = await makeCharged();
    const paid = await makeCharge(org.id, enrollment.id, { period: "2026-05", status: "PAID" });
    const waived = await makeCharge(org.id, enrollment.id, {
      period: "2026-06",
      status: "WAIVED",
    });

    await expect(updateChargeAmount(org.id, paid.id, 1)).rejects.toThrow(ChargeRuleError);
    await expect(updateChargeAmount(org.id, waived.id, 1)).rejects.toThrow(ChargeRuleError);

    expect((await db.charge.findUniqueOrThrow({ where: { id: paid.id } })).amount.toNumber()).toBe(
      18000,
    );
  });

  it("una cuota ajena no se edita", async () => {
    const { org } = await makeCharged();
    const { org: other, enrollment: foreignEnrollment } = await makeCharged("Estudio B");
    const foreign = await makeCharge(other.id, foreignEnrollment.id);

    await expect(updateChargeAmount(org.id, foreign.id, 1)).rejects.toThrow(/no pertenece/);
  });
});

describe("waiveCharge — RN3", () => {
  it("exonera PENDING, PARTIAL y OVERDUE", async () => {
    const { org, enrollment } = await makeCharged();
    const pending = await makeCharge(org.id, enrollment.id, { period: "2026-05" });
    const partial = await makeCharge(org.id, enrollment.id, {
      period: "2026-06",
      status: "PARTIAL",
    });
    const overdue = await makeCharge(org.id, enrollment.id, {
      period: "2026-07",
      status: "OVERDUE",
    });

    for (const charge of [pending, partial, overdue]) {
      await waiveCharge(org.id, charge.id);
      expect((await db.charge.findUniqueOrThrow({ where: { id: charge.id } })).status).toBe(
        "WAIVED",
      );
    }
  });

  it("una PAGADA no se exonera; una ya exonerada tampoco (cada una con su mensaje)", async () => {
    const { org, enrollment } = await makeCharged();
    const paid = await makeCharge(org.id, enrollment.id, { period: "2026-05", status: "PAID" });
    const waived = await makeCharge(org.id, enrollment.id, {
      period: "2026-06",
      status: "WAIVED",
    });

    await expect(waiveCharge(org.id, paid.id)).rejects.toThrow(/pagada no se exonera/);
    await expect(waiveCharge(org.id, waived.id)).rejects.toThrow(/ya está exonerada/);
    expect((await db.charge.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe("PAID");
  });

  it("una cuota ajena no se exonera", async () => {
    const { org } = await makeCharged();
    const { org: other, enrollment: foreignEnrollment } = await makeCharged("Estudio B");
    const foreign = await makeCharge(other.id, foreignEnrollment.id);

    await expect(waiveCharge(org.id, foreign.id)).rejects.toThrow(/no pertenece/);
    expect((await db.charge.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe(
      "PENDING",
    );
  });
});
