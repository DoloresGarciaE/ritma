"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { requireRole, requireScopedMember } from "@/server/authz";
import { ForbiddenError, type Actor } from "@/server/services/permissions";
import {
  closeSettlement,
  markSettlementPaid,
  SettlementRuleError,
  settlementDetail,
  type SettlementDetail,
  type SettlementNumbers,
} from "@/server/services/settlements";

/**
 * Server actions de liquidaciones (S9). El layout de `(app)` NO las protege (POST
 * directo): cerrar y marcar PAID revalidan rol owner/admin; el drill-down acepta
 * también al TEACHER para LA SUYA (settlements:viewOwn — el servicio lo exige con el
 * scope de S7).
 */

async function currentAdmin(): Promise<Actor> {
  const session = await requireSession();
  if (!session.activeOrgId) {
    throw new ForbiddenError("No hay una organización activa.");
  }
  return requireRole(session.activeOrgId, "OWNER", "ADMIN");
}

function revalidateSettlements() {
  revalidatePath("/estudio/liquidaciones");
}

export async function settlementDetailAction(
  teacherId: string,
  period: string,
): Promise<SettlementDetail | { error: string }> {
  const session = await requireSession();
  if (!session.activeOrgId) throw new ForbiddenError("No hay una organización activa.");
  const { actor, scope } = await requireScopedMember(session.activeOrgId);

  try {
    return await settlementDetail(actor, scope, teacherId, period);
  } catch (error) {
    if (error instanceof SettlementRuleError) return { error: error.message };
    throw error;
  }
}

export async function closeSettlementAction(
  teacherId: string,
  period: string,
): Promise<{ numbers?: SettlementNumbers; error?: string }> {
  const actor = await currentAdmin();

  try {
    const { numbers } = await closeSettlement(actor, teacherId, period);
    revalidateSettlements();
    return { numbers };
  } catch (error) {
    if (error instanceof SettlementRuleError) return { error: error.message };
    throw error;
  }
}

export async function markSettlementPaidAction(
  settlementId: string,
): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  try {
    await markSettlementPaid(actor, settlementId);
  } catch (error) {
    if (error instanceof SettlementRuleError) return { error: error.message };
    throw error;
  }
  revalidateSettlements();
  return {};
}
