"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { isCivilDate } from "@/lib/dates";
import { isEmailConfigured, sendInvitationEmail } from "@/lib/email";
import { invitationUrl } from "@/lib/invitations";
import { requireRole } from "@/server/authz";
import { getShellOrganization } from "@/server/organizations";
import {
  AgreementRuleError,
  listAgreements,
  listRentalAgreements,
  setAgreement,
  setRentalAgreement,
  type AgreementListItem,
  type RentalAgreementItem,
} from "@/server/services/agreements";
import { ForbiddenError, type Actor } from "@/server/services/permissions";
import {
  createExternalProfile,
  createInvitation,
  getInvitationToken,
  regenerateInvitation,
  revokeInvitation,
  revokeMemberAccess,
  TeamRuleError,
  updateExternalProfile,
} from "@/server/services/team";

import { inviteSchema } from "./schema";

/**
 * Server actions del equipo (S7, HU1.3). El layout de `(app)` NO las protege (se
 * invocan por POST directo): cada una revalida sesión Y rol — la matriz reserva
 * `members:manage` a owner/admin, y el servicio lo vuelve a exigir (doble guardia).
 */

const ROLE_LABEL = { ADMIN: "Admin", TEACHER: "Profe" } as const;

async function currentAdmin(): Promise<Actor> {
  const session = await requireSession();
  if (!session.activeOrgId) {
    throw new ForbiddenError("No hay una organización activa.");
  }
  return requireRole(session.activeOrgId, "OWNER", "ADMIN");
}

export type InviteFormState =
  | {
      url: string;
      /** El email salió de verdad; sin email o con Resend caído, false. */
      emailSent: boolean;
      /** Por qué no salió, cuando había email (§4.3: deshabilitado CON motivo). */
      emailError?: string;
    }
  | { error: string; field?: "email" };

export async function createInvitationAction(input: unknown): Promise<InviteFormState> {
  const actor = await currentAdmin();

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message ?? "Revisá los datos de la invitación.",
      field: issue?.path[0] === "email" ? "email" : undefined,
    };
  }

  const { token } = await createInvitation(actor, parsed.data);
  const url = invitationUrl(token);
  revalidatePath("/estudio/equipo");

  if (!parsed.data.email) return { url, emailSent: false };

  if (!isEmailConfigured()) {
    return {
      url,
      emailSent: false,
      emailError: "El envío por email no está disponible por ahora. Compartí el link.",
    };
  }

  try {
    const org = await getShellOrganization(actor.orgId);
    await sendInvitationEmail({
      to: parsed.data.email,
      orgName: org?.name ?? "Tu estudio",
      roleLabel: ROLE_LABEL[parsed.data.role],
      url,
    });
    return { url, emailSent: true };
  } catch {
    // La invitación ya existe y el link funciona: el email caído no la invalida.
    return {
      url,
      emailSent: false,
      emailError: "No pudimos mandar el email. El link igual funciona: compartilo vos.",
    };
  }
}

export async function invitationLinkAction(
  invitationId: string,
): Promise<{ url: string } | { error: string }> {
  const actor = await currentAdmin();

  const row = await getInvitationToken(actor, invitationId);
  if (!row) return { error: "Esa invitación ya no existe o ya fue usada." };
  return { url: invitationUrl(row.token) };
}

export async function regenerateInvitationAction(
  invitationId: string,
): Promise<{ url: string } | { error: string }> {
  const actor = await currentAdmin();

  try {
    const { token } = await regenerateInvitation(actor, invitationId);
    revalidatePath("/estudio/equipo");
    return { url: invitationUrl(token) };
  } catch (error) {
    if (error instanceof TeamRuleError) return { error: error.message };
    throw error;
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  try {
    await revokeInvitation(actor, invitationId);
  } catch (error) {
    if (error instanceof TeamRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/estudio/equipo");
  return {};
}

export async function revokeMemberAction(targetUserId: string): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  try {
    await revokeMemberAccess(actor, targetUserId);
  } catch (error) {
    if (error instanceof TeamRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/estudio/equipo");
  return {};
}

// ─── Acuerdos económicos (S9, HU6.1) — owner/admin, patrón de arriba. ─────────

const agreementSchema = z.object({
  teacherId: z.string().min(1),
  studioPercent: z
    .number({ error: "Poné el porcentaje del estudio." })
    .min(0, "Entre 0 y 100.")
    .max(100, "Entre 0 y 100."),
  validFrom: z.string().refine(isCivilDate, "Esa fecha no es válida."),
});

export async function listAgreementsAction(
  teacherId: string,
): Promise<AgreementListItem[] | { error: string }> {
  const actor = await currentAdmin();
  return listAgreements(actor, teacherId);
}

export async function setAgreementAction(input: {
  teacherId: string;
  studioPercent: number | null;
  validFrom: string;
}): Promise<{ error?: string; field?: "studioPercent" | "validFrom" }> {
  const actor = await currentAdmin();

  const parsed = agreementSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message ?? "Revisá el acuerdo.",
      field: issue?.path[0] === "validFrom" ? "validFrom" : "studioPercent",
    };
  }

  try {
    await setAgreement(actor, parsed.data);
  } catch (error) {
    if (error instanceof AgreementRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/estudio/equipo");
  revalidatePath("/estudio/liquidaciones");
  return {};
}

// ─── Externos y su acuerdo de alquiler (S10, HU6.1/HU6.3) — mismo patrón. ─────

export async function createExternalAction(
  displayName: string,
): Promise<{ id?: string; error?: string }> {
  const actor = await currentAdmin();

  try {
    const { id } = await createExternalProfile(actor, displayName);
    revalidatePath("/estudio/equipo");
    return { id };
  } catch (error) {
    if (error instanceof TeamRuleError) return { error: error.message };
    throw error;
  }
}

export async function renameExternalAction(
  teacherId: string,
  displayName: string,
): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  try {
    await updateExternalProfile(actor, teacherId, displayName);
  } catch (error) {
    if (error instanceof TeamRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/estudio/equipo");
  return {};
}

const rentalAgreementSchema = z.object({
  teacherId: z.string().min(1),
  rentalAmount: z
    .number({ error: "Poné la tarifa del alquiler." })
    .positive("La tarifa tiene que ser mayor a cero."),
  rentalPeriod: z.enum(["MONTHLY", "PER_SESSION", "PER_HOUR"]),
  validFrom: z.string().refine(isCivilDate, "Esa fecha no es válida."),
});

export async function listRentalAgreementsAction(
  teacherId: string,
): Promise<RentalAgreementItem[] | { error: string }> {
  const actor = await currentAdmin();
  return listRentalAgreements(actor, teacherId);
}

export async function setRentalAgreementAction(input: {
  teacherId: string;
  rentalAmount: number | null;
  rentalPeriod: "MONTHLY" | "PER_SESSION" | "PER_HOUR";
  validFrom: string;
}): Promise<{ error?: string; field?: "rentalAmount" | "validFrom" }> {
  const actor = await currentAdmin();

  const parsed = rentalAgreementSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message ?? "Revisá el acuerdo.",
      field: issue?.path[0] === "validFrom" ? "validFrom" : "rentalAmount",
    };
  }

  try {
    await setRentalAgreement(actor, parsed.data);
  } catch (error) {
    if (error instanceof AgreementRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/estudio/equipo");
  revalidatePath("/estudio/alquileres");
  return {};
}
