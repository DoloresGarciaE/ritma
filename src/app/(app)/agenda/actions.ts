"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { requireMember } from "@/server/authz";
import {
  createDiscipline,
  createGroup,
  setGroupActive,
  updateGroup,
} from "@/server/services/groups";

import { groupSchema, toGroupFieldErrors, type GroupFormState } from "./schema";

/**
 * Server actions de la agenda.
 *
 * OJO: el layout de `(app)` NO protege las server actions — se invocan por POST directo,
 * sin pasar por él. Por eso cada una revalida la membresía con `requireMember`. El orgId
 * sale SIEMPRE de la sesión, nunca de un input del cliente. `groups:manage` incluye a los
 * tres roles (Plan §4), así que la membresía alcanza como guardia en Fase 1.
 */
async function currentOrgId(): Promise<string> {
  const session = await requireSession();
  const actor = await requireMember(session.activeOrgId!);
  return actor.orgId;
}

/** Un solo revalidate: `/agenda` cubre todos sus searchParams, y el dashboard es S6. */
function revalidateAgenda() {
  revalidatePath("/agenda");
}

export type GroupActionInput = {
  name: string;
  disciplineId: string;
  defaultPrice: number | null;
  slots: { id?: string; weekday: number; startTime: string; durationMin: number | null }[];
};

/** Alta de grupo con sus franjas (HU3.1). */
export async function createGroupAction(input: GroupActionInput): Promise<GroupFormState> {
  const orgId = await currentOrgId();

  // Los errores se DEVUELVEN como estado: un throw se lo comería el error boundary y el
  // profe vería un crash en vez del mensaje en su campo (Componentes §4.1).
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { errors: toGroupFieldErrors(parsed.error) };

  await createGroup(orgId, parsed.data);

  revalidateAgenda();
  return {};
}

/** Edición de grupo (HU3.1). El diff de franjas vive en el servicio. */
export async function updateGroupAction(
  groupId: string,
  input: GroupActionInput,
): Promise<GroupFormState> {
  const orgId = await currentOrgId();

  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { errors: toGroupFieldErrors(parsed.error) };

  await updateGroup(orgId, groupId, parsed.data);

  revalidateAgenda();
  return {};
}

/** El switch "Grupo activo" (§3.2): aplica al instante, sin esperar el Guardar (RN9). */
export async function setGroupActiveAction(groupId: string, active: boolean): Promise<void> {
  const orgId = await currentOrgId();
  await setGroupActive(orgId, groupId, active);

  revalidateAgenda();
}

/** Disciplina "al vuelo" desde el form de grupo (HU3.1). Idempotente por [orgId, name]. */
export async function createDisciplineAction(
  name: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const orgId = await currentOrgId();

  const trimmed = name.trim();
  if (trimmed.length === 0) return { error: "Poné el nombre de la disciplina." };
  if (trimmed.length > 40) return { error: "Máximo 40 caracteres." };

  const discipline = await createDiscipline(orgId, trimmed);

  revalidateAgenda();
  return discipline;
}
