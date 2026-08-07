import { civilDateOf } from "@/lib/dates";
import { withOrg } from "@/lib/db";
import { formatMoney, formatPeriod } from "@/lib/format";
import { defaultReminderTemplate, firstNameOf, renderTemplate } from "@/lib/reminders";

import { debtorsForPeriod } from "./charges";

/**
 * Recordatorios (HU5.2–5.3): armar el mensaje desde la plantilla de la org y dejar
 * registro de cada disparo. El render es puro (lib/reminders); acá viven los datos.
 *
 * El log es deliberadamente honesto: WHATSAPP_LINK se registra al DISPARAR el link
 * (F2 paso 3) — la app no puede saber si el profe tocó "enviar" en WhatsApp. EMAIL se
 * registra recién cuando Resend aceptó el envío.
 */

export type ReminderChannelValue = "WHATSAPP_LINK" | "EMAIL";

/** Reglas de recordatorio violadas → mensaje para la UI (patrón ChargeRuleError). */
export class ReminderRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReminderRuleError";
  }
}

/**
 * Registra un recordatorio. Como todo id que viene del cliente, `studentId` (y
 * `chargeId` si viniera) se verifica contra la org ANTES de escribir: un FK no
 * distingue tenants.
 */
export async function logReminder(
  orgId: string,
  input: { studentId: string; channel: ReminderChannelValue; chargeId?: string },
): Promise<{ id: string }> {
  const org = withOrg(orgId);

  const student = await org.student.findUnique({
    where: { id: input.studentId },
    select: { id: true },
  });
  if (!student) throw new ReminderRuleError("El alumno no existe o no es de esta organización.");

  if (input.chargeId) {
    const charge = await org.charge.findUnique({
      where: { id: input.chargeId },
      select: { id: true },
    });
    if (!charge) throw new ReminderRuleError("La cuota no existe o no es de esta organización.");
  }

  return org.reminderLog.create({
    // El orgId es del TIPO del create; en runtime el hook de withOrg lo fuerza igual.
    data: {
      orgId,
      studentId: input.studentId,
      chargeId: input.chargeId ?? null,
      channel: input.channel,
      sentAt: new Date(),
    },
    select: { id: true },
  });
}

/**
 * Los ajustes de cobranzas (S5): alias y plantilla. `null` = "sin alias" / "usar la
 * default de Marca §4.2". La autorización (owner/admin) es de la action; acá el scope.
 */
export async function updateBillingSettings(
  orgId: string,
  input: { paymentAlias: string | null; reminderTemplate: string | null },
): Promise<void> {
  await withOrg(orgId).organization.update({
    where: { id: orgId },
    data: { paymentAlias: input.paymentAlias, reminderTemplate: input.reminderTemplate },
    select: { id: true },
  });
}

export type ReminderHistoryItem = {
  id: string;
  /** Fecha civil del envío EN LA ZONA DE LA ORG (RN10) — nunca un Date crudo a la UI. */
  date: string;
  channel: ReminderChannelValue;
};

/** El historial de la ficha (HU2.2): fecha y canal, sin estados de "leído" inventados. */
export async function listRemindersForStudent(
  orgId: string,
  studentId: string,
  timezone: string,
): Promise<ReminderHistoryItem[]> {
  const rows = await withOrg(orgId).reminderLog.findMany({
    where: { studentId },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    select: { id: true, sentAt: true, channel: true },
  });

  return rows.map((row) => ({
    id: row.id,
    date: civilDateOf(row.sentAt, timezone),
    channel: row.channel,
  }));
}

export type ReminderDraft = {
  /** La plantilla renderizada: nombre, período, monto y alias ya puestos. */
  message: string;
  /** La deuda del período (remanentes, no montos originales), para decidir si se ofrece. */
  debt: number;
  student: { id: string; name: string; phone: string | null; email: string | null };
  /** Para el asunto y el pie del email (Marca §9.3). */
  orgName: string;
};

/**
 * Arma el recordatorio de UN alumno para UN período: plantilla de la org (o la default
 * de Marca §4.2), deuda = suma de remanentes del período (RN4: lo que FALTA, no lo
 * facturado). El caller decide el canal.
 */
export async function buildReminder(
  orgId: string,
  studentId: string,
  period: string,
): Promise<ReminderDraft> {
  const org = withOrg(orgId);

  const [settings, student, debtors] = await Promise.all([
    org.organization.findUnique({
      where: { id: orgId },
      select: { name: true, reminderTemplate: true, paymentAlias: true },
    }),
    org.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, phone: true, email: true },
    }),
    debtorsForPeriod(orgId, period, { studentId }),
  ]);
  if (!settings) throw new ReminderRuleError("La organización no existe.");
  if (!student) throw new ReminderRuleError("El alumno no existe o no es de esta organización.");

  const message = renderTemplate(
    settings.reminderTemplate ?? defaultReminderTemplate(settings.paymentAlias ?? ""),
    {
      nombre: firstNameOf(student.name),
      periodo: formatPeriod(period),
      monto: formatMoney(debtors.total),
      alias: settings.paymentAlias ?? "",
    },
  );

  return { message, debt: debtors.total, student, orgName: settings.name };
}
