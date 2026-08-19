"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { expandFranjas } from "@/lib/franjas";
import { requireRole, requireScopedMember } from "@/server/authz";
import { ForbiddenError, type DataScope } from "@/server/services/permissions";
import {
  createDiscipline,
  createGroup,
  setGroupActive,
  updateGroup,
} from "@/server/services/groups";
import { cancelSession, rescheduleSession, restoreSession } from "@/server/services/sessions";

import {
  groupSchema,
  occurrenceRefSchema,
  rescheduleSchema,
  toGroupFieldErrors,
  toRescheduleFieldErrors,
  type GroupFormState,
  type RescheduleFormState,
} from "./schema";

/**
 * Server actions de la agenda.
 *
 * OJO: el layout de `(app)` NO protege las server actions — se invocan por POST directo,
 * sin pasar por él. Por eso cada una revalida membresía Y alcance (S7): el `scope` baja
 * al servicio, que para un TEACHER solo deja tocar SUS grupos y sesiones. Crear grupos,
 * activarlos/desactivarlos y crear disciplinas quedó para owner/admin (decisión S7 de la
 * matriz). El orgId sale SIEMPRE de la sesión, nunca de un input del cliente.
 */
async function currentScoped(): Promise<{ orgId: string; scope: DataScope }> {
  const session = await requireSession();
  // Sin org activa no hay nada que autorizar: el mismo error controlado que "no sos
  // miembro" (un `!` acá dejaría pasar un null a Prisma, que revienta con un 500 crudo).
  if (!session.activeOrgId) throw new ForbiddenError("La sesión no tiene organización activa.");
  const { actor, scope } = await requireScopedMember(session.activeOrgId);
  return { orgId: actor.orgId, scope };
}

async function currentAdminOrgId(): Promise<string> {
  const session = await requireSession();
  if (!session.activeOrgId) throw new ForbiddenError("La sesión no tiene organización activa.");
  const actor = await requireRole(session.activeOrgId, "OWNER", "ADMIN");
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
  /** Profe a cargo (S7, solo STUDIO): `null` = sin asignar; ausente = no tocar. */
  teacherId?: string | null;
  /** Franjas multi-día de UI: la action las EXPANDE a un slot por día (lib/franjas). */
  franjas: {
    days: { weekday: number; slotId?: string }[];
    startTime: string;
    durationMin: number | null;
  }[];
};

/**
 * Alta de grupo con sus franjas (HU3.1). Las franjas se expanden acá, tras el Zod.
 * Owner/admin (decisión S7): en un estudio, la estructura la arma quien gestiona.
 */
export async function createGroupAction(input: GroupActionInput): Promise<GroupFormState> {
  const orgId = await currentAdminOrgId();

  // Los errores se DEVUELVEN como estado: un throw se lo comería el error boundary y el
  // profe vería un crash en vez del mensaje en su campo (Componentes §4.1). El Zod
  // también corta las colisiones internas (mismo día + misma hora, superRefine).
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { errors: toGroupFieldErrors(parsed.error) };

  const { franjas, ...groupData } = parsed.data;
  await createGroup(orgId, { ...groupData, slots: expandFranjas(franjas) });

  revalidateAgenda();
  return {};
}

/**
 * Edición de grupo (HU3.1). La expansión conserva el `slotId` de cada día, así el diff
 * del servicio decide igual que siempre: hora/duración in place (las excepciones
 * sobreviven), día quitado = slot borrado (sus excepciones se van por cascada). El diff
 * corre en una transacción del servicio.
 *
 * Los tres roles editan (S7): el servicio acota QUÉ grupos (los suyos, por scope) y QUÉ
 * campos (a un teacher, precio y profe a cargo se le fuerzan como están).
 */
export async function updateGroupAction(
  groupId: string,
  input: GroupActionInput,
): Promise<GroupFormState> {
  const { orgId, scope } = await currentScoped();

  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { errors: toGroupFieldErrors(parsed.error) };

  const { franjas, ...groupData } = parsed.data;
  await updateGroup(orgId, scope, groupId, { ...groupData, slots: expandFranjas(franjas) });

  revalidateAgenda();
  return {};
}

/**
 * El switch "Grupo activo" (§3.2): aplica al instante, sin esperar el Guardar (RN9).
 * Owner/admin (decisión S7): sacar un grupo de la agenda es estructura, no gestión diaria.
 */
export async function setGroupActiveAction(groupId: string, active: boolean): Promise<void> {
  const orgId = await currentAdminOrgId();
  await setGroupActive(orgId, groupId, active);

  revalidateAgenda();
}

/**
 * Cancela SOLO esa ocurrencia (HU3.3, RN8). La identidad es `(slotId, date ORIGINAL)`:
 * los inputs forjados los corta el servicio (franja ajena, fecha que no es ocurrencia).
 */
export async function cancelSessionAction(input: { slotId: string; date: string }): Promise<void> {
  const { orgId, scope } = await currentScoped();

  const parsed = occurrenceRefSchema.parse(input);
  await cancelSession(orgId, scope, parsed);

  revalidateAgenda();
}

/** Mueve SOLO esa ocurrencia a otra fecha/hora (HU3.3). */
export async function rescheduleSessionAction(input: {
  slotId: string;
  date: string;
  movedToDate: string;
  movedToStartTime: string;
}): Promise<RescheduleFormState> {
  const { orgId, scope } = await currentScoped();

  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { errors: toRescheduleFieldErrors(parsed.error) };

  await rescheduleSession(orgId, scope, parsed.data);

  revalidateAgenda();
  return {};
}

/** Restablece la ocurrencia: borra la excepción (cancelada o movida) y vuelve la regla. */
export async function restoreSessionAction(input: { slotId: string; date: string }): Promise<void> {
  const { orgId, scope } = await currentScoped();

  const parsed = occurrenceRefSchema.parse(input);
  await restoreSession(orgId, scope, parsed);

  revalidateAgenda();
}

/**
 * Disciplina "al vuelo" desde el form de grupo (HU3.1). Idempotente por [orgId, name].
 * Owner/admin (S7): el catálogo de disciplinas es configuración de la org.
 */
export async function createDisciplineAction(
  name: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const orgId = await currentAdminOrgId();

  const trimmed = name.trim();
  if (trimmed.length === 0) return { error: "Poné el nombre de la disciplina." };
  if (trimmed.length > 40) return { error: "Máximo 40 caracteres." };

  const discipline = await createDiscipline(orgId, trimmed);

  revalidateAgenda();
  return discipline;
}
