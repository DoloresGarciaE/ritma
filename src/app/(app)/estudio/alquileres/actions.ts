"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { isCivilDate } from "@/lib/dates";
import { requireRole } from "@/server/authz";
import { ForbiddenError, type Actor } from "@/server/services/permissions";
import {
  markRentalPaid,
  rentalDetail,
  RentalRuleError,
  updateRentalAmount,
  waiveRentalCharge,
  type PayMethodValue,
  type RentalDetail,
} from "@/server/services/rentals";

/**
 * Server actions de alquileres (S10, HU6.3). El layout de `(app)` NO las protege:
 * cada una revalida sesión y rol (owner/admin) — y el servicio lo vuelve a exigir.
 */

async function currentAdmin(): Promise<Actor> {
  const session = await requireSession();
  if (!session.activeOrgId) {
    throw new ForbiddenError("No hay una organización activa.");
  }
  return requireRole(session.activeOrgId, "OWNER", "ADMIN");
}

export async function rentalDetailAction(
  teacherId: string,
  period: string,
): Promise<RentalDetail | { error: string }> {
  const actor = await currentAdmin();
  try {
    return await rentalDetail(actor, teacherId, period);
  } catch (error) {
    if (error instanceof RentalRuleError) return { error: error.message };
    throw error;
  }
}

export async function updateRentalAmountAction(
  chargeId: string,
  amount: number | null,
): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  if (amount === null || !Number.isFinite(amount)) {
    return { error: "Poné el monto del cargo." };
  }

  try {
    await updateRentalAmount(actor, chargeId, amount);
  } catch (error) {
    if (error instanceof RentalRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/estudio/alquileres");
  return {};
}

export async function markRentalPaidAction(
  chargeId: string,
  input: { paidAt: string; method: PayMethodValue },
): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  if (!isCivilDate(input.paidAt)) return { error: "Esa fecha no es válida." };

  try {
    await markRentalPaid(actor, chargeId, input);
  } catch (error) {
    if (error instanceof RentalRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/estudio/alquileres");
  revalidatePath("/estudio/reportes");
  return {};
}

export async function waiveRentalAction(chargeId: string): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  try {
    await waiveRentalCharge(actor, chargeId);
  } catch (error) {
    if (error instanceof RentalRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/estudio/alquileres");
  return {};
}
