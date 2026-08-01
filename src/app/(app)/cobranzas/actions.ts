"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { requireMember } from "@/server/authz";
import { ChargeRuleError, updateChargeAmount, waiveCharge } from "@/server/services/charges";
import {
  createEnrollment,
  endEnrollment,
  EnrollmentRuleError,
} from "@/server/services/enrollments";
import { assertRole, ForbiddenError, type Actor } from "@/server/services/permissions";

import {
  chargeAmountSchema,
  endEnrollmentSchema,
  enrollSchema,
  toEnrollFieldErrors,
  type ChargeAmountFormState,
  type EnrollFormState,
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
