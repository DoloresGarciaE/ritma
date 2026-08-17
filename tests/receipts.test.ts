import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { getReceiptByToken } from "@/server/public/receipts";
import { rotateReceiptToken } from "@/server/services/payments";

import {
  makeAllocation,
  makeCharge,
  makeEnrollment,
  makeGroup,
  makeOrg,
  makePayment,
  makeStudent,
} from "./factories";

/**
 * La puerta pública de S5 contra Postgres real: el token resuelve EXACTAMENTE la pieza
 * de Marca §9.1 y nada más, un token desconocido no aprende nada, y revocar = rotar.
 *
 * Es la superficie sin sesión de Ritma: el aislamiento acá no lo da withOrg (no hay org)
 * sino el contrato del accesor — por eso el shape se pinnea campo por campo.
 */

/** Pago imputado a una cuota, con todo el árbol (org → alumno → grupo → cuota). */
async function makeReceiptTree(orgName: string, studentName: string, groupName: string) {
  const org = await makeOrg(orgName);
  const student = await makeStudent(org.id, studentName);
  const group = await makeGroup(org.id, groupName);
  const enrollment = await makeEnrollment(org.id, student.id, group.id);
  const charge = await makeCharge(org.id, enrollment.id, { period: "2026-07" });
  const payment = await makePayment(org.id, student.id, { amount: 18000, paidAt: "2026-07-05" });
  await makeAllocation(org.id, payment.id, charge.id, 18000);
  return { org, student, group, enrollment, charge, payment };
}

describe("getReceiptByToken — la pieza pública y nada más", () => {
  it("resuelve el comprobante completo por token, con el shape EXACTO de §9.1", async () => {
    const { payment } = await makeReceiptTree("Danzas Malena", "Sofía Herrera", "Árabe inicial");

    const receipt = await getReceiptByToken(payment.receiptToken);
    expect(receipt).toEqual({
      orgName: "Danzas Malena",
      studentName: "Sofía Herrera",
      amount: 18000,
      currency: "ARS",
      method: "CASH",
      paidAt: "2026-07-05",
      items: [{ period: "2026-07", groupName: "Árabe inicial" }],
    });
    // El pin de privacidad: si mañana alguien agrega un campo al select, este test lo ve.
    expect(Object.keys(receipt!).sort()).toEqual([
      "amount",
      "currency",
      "items",
      "method",
      "orgName",
      "paidAt",
      "studentName",
    ]);
  });

  it("un pago multi-cuota lista todos los conceptos, ordenados por período", async () => {
    const { org, student, payment } = await makeReceiptTree(
      "Danzas Malena",
      "Sofía Herrera",
      "Árabe inicial",
    );
    const group2 = await makeGroup(org.id, "Folklore adultos");
    const enrollment2 = await makeEnrollment(org.id, student.id, group2.id);
    const juneCharge = await makeCharge(org.id, enrollment2.id, { period: "2026-06" });
    await makeAllocation(org.id, payment.id, juneCharge.id, 15000);

    const receipt = await getReceiptByToken(payment.receiptToken);
    expect(receipt?.items).toEqual([
      { period: "2026-06", groupName: "Folklore adultos" },
      { period: "2026-07", groupName: "Árabe inicial" },
    ]);
  });

  it("un pago sin imputaciones (todo a favor) resuelve con items vacío", async () => {
    const org = await makeOrg("Danzas Malena");
    const student = await makeStudent(org.id, "Julieta Paz");
    const payment = await makePayment(org.id, student.id, { amount: 25000 });

    const receipt = await getReceiptByToken(payment.receiptToken);
    expect(receipt?.amount).toBe(25000);
    expect(receipt?.items).toEqual([]);
  });

  it("token desconocido o basura → null (404 genérico: no se aprende ni si existe)", async () => {
    await makeReceiptTree("Danzas Malena", "Sofía Herrera", "Árabe inicial");

    expect(await getReceiptByToken("token-que-no-existe-123456789012")).toBeNull();
    expect(await getReceiptByToken("")).toBeNull();
    expect(await getReceiptByToken("x".repeat(500))).toBeNull();
  });

  it("cada token resuelve SOLO su comprobante: el de A no filtra nada de B", async () => {
    const { payment: aPayment } = await makeReceiptTree(
      "Estudio A",
      "Sofía Herrera",
      "Árabe inicial",
    );
    const { payment: bPayment } = await makeReceiptTree(
      "Estudio B",
      "Malena Ríos",
      "Contemporáneo",
    );

    const aReceipt = await getReceiptByToken(aPayment.receiptToken);
    const bReceipt = await getReceiptByToken(bPayment.receiptToken);
    expect(aReceipt?.orgName).toBe("Estudio A");
    expect(aReceipt?.studentName).toBe("Sofía Herrera");
    expect(bReceipt?.orgName).toBe("Estudio B");
    expect(bReceipt?.studentName).toBe("Malena Ríos");
  });

  it("si el pago se elimina (RN12), el token muere con él", async () => {
    const { org, payment } = await makeReceiptTree(
      "Danzas Malena",
      "Sofía Herrera",
      "Árabe inicial",
    );

    await db.payment.delete({ where: { id: payment.id } });
    expect(await getReceiptByToken(payment.receiptToken)).toBeNull();
    // La org y el resto del árbol siguen: solo murió el comprobante de ESE pago.
    expect(await db.organization.findUnique({ where: { id: org.id } })).not.toBeNull();
  });
});

describe("rotateReceiptToken — revocar = rotar", () => {
  it("el link viejo muere en el acto y el nuevo resuelve el mismo comprobante", async () => {
    const { org, payment } = await makeReceiptTree(
      "Danzas Malena",
      "Sofía Herrera",
      "Árabe inicial",
    );

    const { receiptToken: fresh } = await rotateReceiptToken(org.id, { kind: "all" }, payment.id);
    expect(fresh).not.toBe(payment.receiptToken);

    expect(await getReceiptByToken(payment.receiptToken)).toBeNull();
    const receipt = await getReceiptByToken(fresh);
    expect(receipt?.studentName).toBe("Sofía Herrera");
  });

  it("A no puede rotar el token de un pago de B (P2025), y el link de B sigue vivo", async () => {
    const a = await makeOrg("Estudio A");
    const { payment: bPayment } = await makeReceiptTree(
      "Estudio B",
      "Malena Ríos",
      "Contemporáneo",
    );

    await expect(rotateReceiptToken(a.id, { kind: "all" }, bPayment.id)).rejects.toMatchObject({
      code: "P2025",
    });
    expect(await getReceiptByToken(bPayment.receiptToken)).not.toBeNull();
  });
});
