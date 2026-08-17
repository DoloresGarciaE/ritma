import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/reminders";
import {
  buildReminder,
  listRemindersForStudent,
  logReminder,
  ReminderRuleError,
} from "@/server/services/reminders";

import {
  makeAllocation,
  makeCharge,
  makeEnrollment,
  makeGroup,
  makeOrg,
  makePayment,
  makeReminderLog,
  makeStudent,
} from "./factories";

/**
 * Recordatorios contra Postgres real (HU5.2–5.3): referencias cruzadas verificadas ANTES
 * de escribir, historial en fecha civil de la org, y el mensaje armado con la deuda del
 * período (remanentes, no montos originales).
 */

const TZ = "America/Argentina/Buenos_Aires";

describe("logReminder — referencias cruzadas primero", () => {
  it("registra el disparo con canal y sentAt", async () => {
    const org = await makeOrg("Danzas Malena");
    const student = await makeStudent(org.id, "Sofía Herrera");

    const { id } = await logReminder(
      org.id,
      { kind: "all" },
      { studentId: student.id, channel: "WHATSAPP_LINK" },
    );

    const row = await db.reminderLog.findUniqueOrThrow({ where: { id } });
    expect(row.orgId).toBe(org.id);
    expect(row.studentId).toBe(student.id);
    expect(row.channel).toBe("WHATSAPP_LINK");
    expect(row.chargeId).toBeNull();
    expect(row.sentAt.getTime()).toBeGreaterThan(0);
  });

  it("un studentId de OTRA org rechaza sin escribir nada en ninguna", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bStudent = await makeStudent(b.id, "Malena Ríos");

    await expect(
      logReminder(a.id, { kind: "all" }, { studentId: bStudent.id, channel: "EMAIL" }),
    ).rejects.toBeInstanceOf(ReminderRuleError);
    expect(await db.reminderLog.count()).toBe(0);
  });

  it("un chargeId de OTRA org rechaza sin escribir, aunque el alumno sea propio", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aStudent = await makeStudent(a.id, "Sofía Herrera");
    const bStudent = await makeStudent(b.id, "Malena Ríos");
    const bGroup = await makeGroup(b.id, "Contemporáneo");
    const bEnrollment = await makeEnrollment(b.id, bStudent.id, bGroup.id);
    const bCharge = await makeCharge(b.id, bEnrollment.id);

    await expect(
      logReminder(
        a.id,
        { kind: "all" },
        {
          studentId: aStudent.id,
          channel: "WHATSAPP_LINK",
          chargeId: bCharge.id,
        },
      ),
    ).rejects.toBeInstanceOf(ReminderRuleError);
    expect(await db.reminderLog.count()).toBe(0);
  });
});

describe("listRemindersForStudent — el historial de la ficha", () => {
  it("ordena más nuevo primero y convierte el instante a fecha civil de la org", async () => {
    const org = await makeOrg("Danzas Malena");
    const student = await makeStudent(org.id, "Sofía Herrera");
    // 02:30 UTC = todavía el día anterior en Buenos Aires (RN10).
    await makeReminderLog(org.id, student.id, {
      channel: "WHATSAPP_LINK",
      sentAt: new Date("2026-07-11T02:30:00Z"),
    });
    await makeReminderLog(org.id, student.id, {
      channel: "EMAIL",
      sentAt: new Date("2026-07-14T18:00:00Z"),
    });

    const history = await listRemindersForStudent(org.id, { kind: "all" }, student.id, TZ);
    expect(history.map((h) => [h.date, h.channel])).toEqual([
      ["2026-07-14", "EMAIL"],
      ["2026-07-10", "WHATSAPP_LINK"],
    ]);
  });

  it("no mezcla recordatorios de otros alumnos", async () => {
    const org = await makeOrg("Danzas Malena");
    const sofia = await makeStudent(org.id, "Sofía Herrera");
    const julieta = await makeStudent(org.id, "Julieta Paz");
    await makeReminderLog(org.id, julieta.id);

    expect(await listRemindersForStudent(org.id, { kind: "all" }, sofia.id, TZ)).toEqual([]);
  });
});

describe("buildReminder — el mensaje del DoD", () => {
  /** Alumno con dos cuotas de julio ($18.000 y $15.000, una con pago parcial de $5.000). */
  async function makeScenario() {
    const org = await makeOrg("Danzas Malena");
    const student = await makeStudent(org.id, "Sofía Herrera", { phone: "+5491155554433" });
    const arabe = await makeGroup(org.id, "Árabe inicial");
    const folklore = await makeGroup(org.id, "Folklore adultos");
    const enrollArabe = await makeEnrollment(org.id, student.id, arabe.id);
    const enrollFolklore = await makeEnrollment(org.id, student.id, folklore.id);
    const chargeArabe = await makeCharge(org.id, enrollArabe.id, {
      period: "2026-07",
      amount: 18000,
    });
    await makeCharge(org.id, enrollFolklore.id, {
      period: "2026-07",
      amount: 15000,
      status: "PARTIAL",
    });
    // Pago parcial de $5.000 a la de folklore: la deuda del período baja a $28.000.
    const payment = await makePayment(org.id, student.id, { amount: 5000 });
    const folkloreCharge = await db.charge.findFirstOrThrow({
      where: { enrollmentId: enrollFolklore.id },
    });
    await makeAllocation(org.id, payment.id, folkloreCharge.id, 5000);
    // Ruido: una cuota de OTRO período no entra en el recordatorio de julio.
    await makeCharge(org.id, enrollArabe.id, { period: "2026-06", amount: 18000 });
    return { org, student, chargeArabe };
  }

  it("renderiza la plantilla default con nombre de pila, período, REMANENTE del período y alias", async () => {
    const { org, student } = await makeScenario();
    await db.organization.update({ where: { id: org.id }, data: { paymentAlias: "malena.mp" } });

    const draft = await buildReminder(org.id, { kind: "all" }, student.id, "2026-07");
    expect(draft.debt).toBe(28000);
    expect(draft.message).toBe(
      "Hola Sofía 👋 Te paso el resumen de Julio 2026: $28.000. " +
        "Podés transferir a malena.mp. ¡Gracias!",
    );
    expect(draft.student.phone).toBe("+5491155554433");
  });

  it("usa la plantilla propia de la org si existe; sin alias, {alias} queda vacío", async () => {
    const { org, student } = await makeScenario();
    await db.organization.update({
      where: { id: org.id },
      data: { reminderTemplate: "{nombre} debe {monto} de {periodo}. Alias: {alias}" },
    });

    const draft = await buildReminder(org.id, { kind: "all" }, student.id, "2026-07");
    expect(draft.message).toBe("Sofía debe $28.000 de Julio 2026. Alias: ");
  });

  it("sin deuda en el período, el monto es $0 y debt lo dice (la UI decide no ofrecerlo)", async () => {
    const org = await makeOrg("Danzas Malena");
    const student = await makeStudent(org.id, "Julieta Paz");

    const draft = await buildReminder(org.id, { kind: "all" }, student.id, "2026-07");
    expect(draft.debt).toBe(0);
    expect(draft.message).toContain("$0");
    expect(DEFAULT_REMINDER_TEMPLATE).toContain("{monto}"); // el render usó la default
  });

  it("org sin alias con plantilla default: la frase de la transferencia no existe", async () => {
    const { org, student } = await makeScenario(); // makeOrg no setea paymentAlias

    const draft = await buildReminder(org.id, { kind: "all" }, student.id, "2026-07");
    expect(draft.message).toBe(
      "Hola Sofía 👋 Te paso el resumen de Julio 2026: $28.000. ¡Gracias!",
    );
    expect(draft.message).not.toContain("transferir a .");
  });

  it("un alumno de OTRA org rechaza con ReminderRuleError", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const bStudent = await makeStudent(b.id, "Malena Ríos");

    await expect(
      buildReminder(a.id, { kind: "all" }, bStudent.id, "2026-07"),
    ).rejects.toBeInstanceOf(ReminderRuleError);
  });
});
