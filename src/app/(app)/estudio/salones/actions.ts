"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { requireRole } from "@/server/authz";
import { ForbiddenError, type Actor } from "@/server/services/permissions";
import {
  createSpace,
  deactivateSpace,
  reactivateSpace,
  renameSpace,
  SpaceRuleError,
} from "@/server/services/spaces";

/**
 * Server actions de salones (S8). El layout de `(app)` NO las protege (POST directo):
 * cada una revalida sesión Y rol — `spaces:manage` es de owner/admin (Plan §4) y el
 * servicio lo vuelve a exigir (doble guardia, patrón equipo S7).
 */

const nameSchema = z
  .string()
  .trim()
  .min(1, "Poné el nombre del salón.")
  .max(40, "Máximo 40 caracteres.");

async function currentAdmin(): Promise<Actor> {
  const session = await requireSession();
  if (!session.activeOrgId) {
    throw new ForbiddenError("No hay una organización activa.");
  }
  return requireRole(session.activeOrgId, "OWNER", "ADMIN");
}

function revalidateSpaces() {
  revalidatePath("/estudio/salones");
  // El selector del form de grupo y el calendario leen los salones activos.
  revalidatePath("/agenda");
}

export async function createSpaceAction(name: string): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá el nombre." };

  try {
    await createSpace(actor, parsed.data);
  } catch (error) {
    if (error instanceof SpaceRuleError) return { error: error.message };
    throw error;
  }
  revalidateSpaces();
  return {};
}

export async function renameSpaceAction(
  spaceId: string,
  name: string,
): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá el nombre." };

  try {
    await renameSpace(actor, spaceId, parsed.data);
  } catch (error) {
    if (error instanceof SpaceRuleError) return { error: error.message };
    throw error;
  }
  revalidateSpaces();
  return {};
}

export async function deactivateSpaceAction(
  spaceId: string,
): Promise<{ unassigned?: number; error?: string }> {
  const actor = await currentAdmin();

  const { unassigned } = await deactivateSpace(actor, spaceId);
  revalidateSpaces();
  return { unassigned };
}

export async function reactivateSpaceAction(spaceId: string): Promise<{ error?: string }> {
  const actor = await currentAdmin();

  await reactivateSpace(actor, spaceId);
  revalidateSpaces();
  return {};
}
