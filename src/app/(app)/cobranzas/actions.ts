"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { periodOf, todayInTz } from "@/lib/dates";
import { isEmailConfigured, sendReminderEmail } from "@/lib/email";
import { formatPeriod } from "@/lib/format";
import { receiptUrl } from "@/lib/receipts";
import { withoutEmojis } from "@/lib/reminders";
import { getOrgSettings } from "@/server/organizations";
import { buildReminder, logReminder, ReminderRuleError } from "@/server/services/reminders";
import {
  deleteAttachment,
  headAttachment,
  isR2Configured,
  paymentAttachmentKey,
  presignAttachmentUpload,
  presignAttachmentView,
  validateAttachment,
} from "@/lib/r2";
import { requireMember } from "@/server/authz";
import { ChargeRuleError, updateChargeAmount, waiveCharge } from "@/server/services/charges";
import {
  createEnrollment,
  endEnrollment,
  EnrollmentRuleError,
} from "@/server/services/enrollments";
import {
  createPayment,
  deletePayment,
  getPaymentAttachment,
  getReceiptToken,
  paymentContext,
  PaymentRuleError,
  rotateReceiptToken,
  setPaymentAttachment,
  type PaymentContext,
} from "@/server/services/payments";
import { assertRole, ForbiddenError, type Actor } from "@/server/services/permissions";

import {
  chargeAmountSchema,
  endEnrollmentSchema,
  enrollSchema,
  paymentSchema,
  toEnrollFieldErrors,
  toPaymentFieldErrors,
  type ChargeAmountFormState,
  type EnrollFormState,
  type PaymentFormState,
} from "./schema";

/**
 * Server actions de cobranzas (S3).
 *
 * OJO: el layout de `(app)` NO protege las server actions — se invocan por POST directo,
 * sin pasar por él. Cada una revalida la membresía; el orgId sale SIEMPRE de la sesión.
 * Editar el monto y exonerar son de owner/admin (Plan §4 "precios" + RN3): `assertRole`
 * acá, y la UI además no se los muestra a un teacher (§4.3) — nunca es la única guardia.
 */
async function currentActor(): Promise<Actor> {
  const session = await requireSession();
  // Sin org activa no hay nada que autorizar: el mismo error controlado que "no sos
  // miembro" (un `!` acá dejaría pasar un null a Prisma, que revienta con un 500 crudo).
  if (!session.activeOrgId) throw new ForbiddenError("La sesión no tiene organización activa.");
  return requireMember(session.activeOrgId);
}

/** La deuda aparece en la ficha, en Cobranzas y en el detalle de sesión: se purgan las tres. */
function revalidateBilling(studentId?: string) {
  revalidatePath("/cobranzas");
  revalidatePath("/agenda");
  revalidatePath("/alumnos");
  if (studentId) revalidatePath(`/alumnos/${studentId}`);
}

/** Inscribir alumno a grupo (HU4.1). La cuota inicial la decide el servicio (RN1/RN2/RN11). */
export async function createEnrollmentAction(input: {
  studentId: string;
  groupId: string;
  plan: "MONTHLY" | "DROP_IN";
  price: number | null;
  startDate: string;
}): Promise<EnrollFormState> {
  const actor = await currentActor();

  // Los errores se DEVUELVEN como estado: un throw se lo comería el error boundary y el
  // profe vería un crash en vez del mensaje en su campo (Componentes §4.1).
  const parsed = enrollSchema.safeParse(input);
  if (!parsed.success) return { errors: toEnrollFieldErrors(parsed.error) };

  try {
    await createEnrollment(actor.orgId, parsed.data);
  } catch (error) {
    // Regla de negocio alcanzable desde la UI (ya inscripto): mensaje, no crash. Una
    // referencia FORJADA (alumno/grupo ajeno) sí revienta al error boundary.
    if (error instanceof EnrollmentRuleError) return { formError: error.message };
    throw error;
  }

  revalidateBilling(parsed.data.studentId);
  return {};
}

/** Baja de inscripción (RN9): endDate; las cuotas ya generadas persisten. */
export async function endEnrollmentAction(input: {
  enrollmentId: string;
  endDate: string;
  /** Solo para revalidar su ficha; la autorización no lo usa. */
  studentId?: string;
}): Promise<EnrollFormState> {
  const actor = await currentActor();

  const parsed = endEnrollmentSchema.safeParse(input);
  if (!parsed.success) return { formError: "Esa fecha no es válida." };

  try {
    await endEnrollment(actor.orgId, parsed.data.enrollmentId, parsed.data.endDate);
  } catch (error) {
    if (error instanceof EnrollmentRuleError) return { formError: error.message };
    throw error;
  }

  revalidateBilling(input.studentId);
  return {};
}

/** Ajuste manual del monto (RN2) — owner/admin (Plan §4: configurar precios). */
export async function updateChargeAmountAction(input: {
  chargeId: string;
  amount: number | null;
  studentId?: string;
}): Promise<ChargeAmountFormState> {
  const actor = await currentActor();
  assertRole(actor, ["OWNER", "ADMIN"]);

  const parsed = chargeAmountSchema.safeParse(input);
  if (!parsed.success) {
    return { errors: { amount: parsed.error.issues[0]?.message ?? "Poné un monto válido." } };
  }

  try {
    await updateChargeAmount(actor.orgId, parsed.data.chargeId, parsed.data.amount);
  } catch (error) {
    if (error instanceof ChargeRuleError) return { formError: error.message };
    throw error;
  }

  revalidateBilling(input.studentId);
  return {};
}

/** Exonerar (RN3: cierre manual sin pago; beca, canje) — owner/admin. */
export async function waiveChargeAction(input: {
  chargeId: string;
  studentId?: string;
}): Promise<ChargeAmountFormState> {
  const actor = await currentActor();
  assertRole(actor, ["OWNER", "ADMIN"]);

  try {
    await waiveCharge(actor.orgId, input.chargeId);
  } catch (error) {
    if (error instanceof ChargeRuleError) return { formError: error.message };
    throw error;
  }

  revalidateBilling(input.studentId);
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagos (S4, HU4.3–HU4.4). `payments:manage` incluye a los tres roles (Plan §4):
// la membresía alcanza como guardia.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que el sheet necesita al abrirse: deuda (pre-carga el monto), crédito y cuotas
 * abiertas. Lectura: no revalida caché.
 */
export async function paymentContextAction(studentId: string): Promise<PaymentContext> {
  const actor = await currentActor();
  return paymentContext(actor.orgId, studentId);
}

/** Registrar pago (HU4.3): pago + imputaciones + estados, transacción o nada. */
export async function createPaymentAction(input: {
  studentId: string;
  amount: number | null;
  method: "CASH" | "TRANSFER" | "OTHER";
  receivedBy?: "STUDIO" | "TEACHER";
  paidAt: string;
  allocations?: { chargeId: string; amount: number }[];
}): Promise<PaymentFormState & { paymentId?: string; receiptShareUrl?: string }> {
  const actor = await currentActor();

  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { errors: toPaymentFieldErrors(parsed.error) };

  let payment: { id: string; receiptToken: string };
  try {
    payment = await createPayment(actor.orgId, parsed.data);
  } catch (error) {
    // Invariantes alcanzables desde la UI (imputación editada contra datos que
    // cambiaron): mensaje, no crash. Referencias forjadas siguen reventando.
    if (error instanceof PaymentRuleError) return { formError: error.message };
    throw error;
  }

  revalidateBilling(parsed.data.studentId);
  // El id encadena la subida del comprobante; la URL del link público viaja YA armada:
  // el toast comparte en el mismo tap, sin otro round-trip que mate la activación.
  return { paymentId: payment.id, receiptShareUrl: receiptUrl(payment.receiptToken) };
}

/** Eliminar un pago (propuesta RN12): revierte imputaciones y recalcula estados. */
export async function deletePaymentAction(input: {
  paymentId: string;
  studentId?: string;
}): Promise<{ formError?: string }> {
  const actor = await currentActor();

  const { attachmentKey } = await deletePayment(actor.orgId, input.paymentId);

  // El objeto de R2 se borra DESPUÉS de que la base confirmó, best-effort.
  if (attachmentKey && isR2Configured()) await deleteAttachment(attachmentKey);

  revalidateBilling(input.studentId);
  return {};
}

// ─── Adjuntos (R2). Reglas duras: nunca públicos, nunca sin permisos, key con orgId. ───

/**
 * URL firmada para SUBIR el comprobante de UN pago propio. La key la arma el server con
 * el orgId de la SESIÓN — el cliente no nombra keys, jamás.
 */
export async function requestAttachmentUploadAction(input: {
  paymentId: string;
  contentType: string;
  size: number;
}): Promise<{ url: string } | { error: string }> {
  const actor = await currentActor();

  if (!isR2Configured()) return { error: "Los comprobantes no están habilitados." };

  const invalid = validateAttachment(input.contentType, input.size);
  if (invalid) return { error: invalid };

  // El pago tiene que existir Y ser de esta org (withOrg filtra: uno ajeno da null).
  const payment = await getPaymentAttachment(actor.orgId, input.paymentId);
  if (!payment) return { error: "El pago no existe." };

  const key = paymentAttachmentKey(actor.orgId, input.paymentId);
  return { url: await presignAttachmentUpload(key, input.contentType) };
}

/**
 * Confirma la subida: verifica contra R2 que el objeto exista con tipo y tamaño válidos
 * (lo que el cliente DICE que subió no cuenta) y recién ahí fija el pointer.
 */
export async function confirmAttachmentAction(input: {
  paymentId: string;
  studentId?: string;
}): Promise<{ error?: string }> {
  const actor = await currentActor();

  if (!isR2Configured()) return { error: "Los comprobantes no están habilitados." };

  const payment = await getPaymentAttachment(actor.orgId, input.paymentId);
  if (!payment) return { error: "El pago no existe." };

  const key = paymentAttachmentKey(actor.orgId, input.paymentId);
  const head = await headAttachment(key);
  if (!head) return { error: "La subida no llegó a R2. Probá de nuevo." };

  const invalid = validateAttachment(head.contentType, head.size);
  if (invalid) {
    await deleteAttachment(key);
    return { error: invalid };
  }

  await setPaymentAttachment(actor.orgId, input.paymentId, key);
  revalidateBilling(input.studentId);
  return {};
}

/**
 * Registra un recordatorio disparado por WhatsApp (F2 paso 3). MEJOR ESFUERZO por
 * diseño y documentado: se loguea al abrir el link — la app no puede saber si el profe
 * tocó "enviar". Por eso el canal EMAIL no se acepta acá: ese lo loguea el server
 * DESPUÉS de que Resend aceptó el envío.
 */
export async function logReminderAction(input: { studentId: string }): Promise<{
  error?: string;
}> {
  const actor = await currentActor();

  try {
    await logReminder(actor.orgId, { studentId: input.studentId, channel: "WHATSAPP_LINK" });
  } catch (error) {
    if (error instanceof ReminderRuleError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/alumnos/${input.studentId}`);
  return {};
}

/**
 * Recordatorio por email (HU5.3): misma plantilla, envío server-side vía Resend detrás
 * de la guarda de env, y el log recién cuando el envío fue ACEPTADO (canal unificado).
 * Siempre sobre el período en curso de la org.
 */
export async function sendEmailReminderAction(studentId: string): Promise<{ error?: string }> {
  const actor = await currentActor();

  if (!isEmailConfigured()) return { error: "El envío por email no está configurado." };

  const settings = await getOrgSettings(actor.orgId);
  const period = periodOf(todayInTz(settings?.timezone ?? ""));

  let draft: Awaited<ReturnType<typeof buildReminder>>;
  try {
    draft = await buildReminder(actor.orgId, studentId, period);
  } catch (error) {
    if (error instanceof ReminderRuleError) return { error: error.message };
    throw error;
  }
  if (!draft.student.email) return { error: "El alumno no tiene email cargado." };
  if (draft.debt <= 0) return { error: "No hay deuda del período para recordar." };

  try {
    await sendReminderEmail({
      to: draft.student.email,
      subject: `Resumen de ${formatPeriod(period)} · ${draft.orgName}`,
      // Misma plantilla que WhatsApp (HU5.3), pero sin emojis: Marca §4 los permite
      // solo en canales conversacionales.
      message: withoutEmojis(draft.message),
      orgName: draft.orgName,
    });
  } catch {
    return { error: "No se pudo enviar el email. Probá de nuevo." };
  }

  await logReminder(actor.orgId, { studentId, channel: "EMAIL" });
  revalidatePath(`/alumnos/${studentId}`);
  return {};
}

/**
 * El link público del comprobante (HU5.1), para compartir. El token viaja recién acá —
 * nunca en el payload de las listas — y previa verificación de membresía; compartir es
 * de cualquier rol (matriz §4: ✔✔✔).
 */
export async function receiptLinkAction(
  paymentId: string,
): Promise<{ url: string } | { error: string }> {
  const actor = await currentActor();

  const payment = await getReceiptToken(actor.orgId, paymentId);
  if (!payment) return { error: "El pago no existe o no es de esta organización." };

  return { url: receiptUrl(payment.receiptToken) };
}

/**
 * Revocar = ROTAR el token (S5): el link compartido muere en el acto y vuelve uno nuevo
 * listo para compartir. La confirmación la pone la UI (§3.8); acá solo la membresía.
 */
export async function revokeReceiptLinkAction(
  paymentId: string,
): Promise<{ url: string } | { error: string }> {
  const actor = await currentActor();

  try {
    const { receiptToken } = await rotateReceiptToken(actor.orgId, paymentId);
    return { url: receiptUrl(receiptToken) };
  } catch {
    // P2025: el pago no es de esta org (o ya no existe). Mismo mensaje genérico.
    return { error: "El pago no existe o no es de esta organización." };
  }
}

/** URL firmada CORTA (60 s) para ver el comprobante, previa verificación de membresía. */
export async function attachmentViewUrlAction(
  paymentId: string,
): Promise<{ url: string } | { error: string }> {
  const actor = await currentActor();

  if (!isR2Configured()) return { error: "Los comprobantes no están habilitados." };

  const payment = await getPaymentAttachment(actor.orgId, paymentId);
  if (!payment?.attachmentKey) return { error: "Este pago no tiene comprobante." };

  return { url: await presignAttachmentView(payment.attachmentKey) };
}
