import { withOrg } from "@/lib/db";

import { groupScopeWhere, type DataScope } from "./permissions";

/**
 * Servicios de grupos (HU3.1).
 *
 * Todo pasa por `withOrg(orgId)` (patrón students.ts): datos YA validados por Zod en la
 * ruta; acá viven las DOS defensas que el hook no puede dar solo (límites conocidos de
 * withOrg, F0.6):
 *
 * 1. **Referencias cruzadas**: un FK no distingue tenants. `disciplineId` (y desde S7
 *    `teacherId`) se verifica contra la org ANTES de escribir — una referencia ajena
 *    solo llega por request forjada, así que se corta con un throw (error boundary),
 *    no con un error de campo.
 * 2. **Escrituras anidadas**: crear franjas junto con el grupo no dispara el hook del
 *    hijo, así que el `orgId` de cada franja va explícito — el mismo ya validado.
 *
 * Desde S7 las lecturas reciben el `DataScope` del actor: para un TEACHER, "sus grupos"
 * es `teacherId = su perfil` — un grupo sin asignar o de otro profe no existe para él.
 */

export type GroupSlot = {
  id: string;
  weekday: number;
  startTime: string;
  durationMin: number;
};

export type GroupListItem = {
  id: string;
  name: string;
  active: boolean;
  /** Numérico plano: `Decimal` no cruza a un client component. */
  defaultPrice: number;
  discipline: { id: string; name: string };
  /** Profe a cargo (S7); null = "sin profe asignado" (solo lo ven owner/admin). */
  teacher: { id: string; displayName: string } | null;
  /** Salón (S8, solo STUDIO); null = sin salón — ciudadano pleno igual. */
  space: { id: string; name: string } | null;
  slots: GroupSlot[];
};

export type SlotInput = {
  /** Presente = franja existente (se diffea); ausente = franja nueva. */
  id?: string;
  weekday: number;
  startTime: string;
  durationMin: number;
};

export type GroupInput = {
  name: string;
  disciplineId: string;
  defaultPrice: number;
  /**
   * Profe a cargo (S7). `undefined` = no tocar (edición) o resolver solo (alta:
   * INDEPENDENT → el perfil del owner; STUDIO → sin asignar); `null` = explícitamente
   * sin profe; string = ese perfil, verificado contra la org.
   */
  teacherId?: string | null;
  /**
   * Salón (S8, solo STUDIO — mismas convenciones que teacherId): `undefined` = no
   * tocar; `null` = sin salón; string = ese salón ACTIVO, verificado contra la org.
   */
  spaceId?: string | null;
  slots: SlotInput[];
};

const SLOT_FIELDS = { id: true, weekday: true, startTime: true, durationMin: true } as const;

const LIST_FIELDS = {
  id: true,
  name: true,
  active: true,
  defaultPrice: true,
  discipline: { select: { id: true, name: true } },
  teacher: { select: { id: true, displayName: true } },
  space: { select: { id: true, name: true } },
  // El orden lunes-primero no se puede expresar en SQL (weekday 0 = domingo): lo hace
  // `toListItem` en JS, así que acá no hay orderBy.
  slots: { select: SLOT_FIELDS },
} as const;

type GroupRow = {
  id: string;
  name: string;
  active: boolean;
  defaultPrice: { toNumber(): number } | number;
  discipline: { id: string; name: string };
  teacher: { id: string; displayName: string } | null;
  space: { id: string; name: string } | null;
  slots: GroupSlot[];
};

/** La UI es lunes-primero: el domingo (0) se muestra último (RN10, semana lun→dom). */
function mondayFirst(weekday: number): number {
  return (weekday + 6) % 7;
}

function toListItem(row: GroupRow): GroupListItem {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    defaultPrice:
      typeof row.defaultPrice === "number" ? row.defaultPrice : row.defaultPrice.toNumber(),
    discipline: row.discipline,
    teacher: row.teacher,
    space: row.space,
    slots: [...row.slots].sort(
      (a, b) =>
        mondayFirst(a.weekday) - mondayFirst(b.weekday) || a.startTime.localeCompare(b.startTime),
    ),
  };
}

/** `throw` y no error de campo: a este punto solo se llega con una request forjada. */
async function assertDisciplineInOrg(orgId: string, disciplineId: string): Promise<void> {
  const discipline = await withOrg(orgId).discipline.findUnique({
    where: { id: disciplineId },
    select: { id: true },
  });
  if (!discipline) throw new Error("La disciplina no pertenece a esta organización.");
}

/** La misma defensa para el profe a cargo (S7): un perfil ajeno no se asigna. */
async function assertTeacherInOrg(orgId: string, teacherId: string): Promise<void> {
  const teacher = await withOrg(orgId).teacherProfile.findUnique({
    where: { id: teacherId },
    select: { id: true },
  });
  if (!teacher) throw new Error("El perfil de profe no pertenece a esta organización.");
}

/**
 * Ídem para el salón (S8): ajeno o DESACTIVADO no se asigna — un salón dado de baja
 * salió del calendario y no puede volver a ocuparse por un form viejo.
 */
async function assertSpaceInOrg(orgId: string, spaceId: string): Promise<void> {
  const space = await withOrg(orgId).space.findUnique({
    where: { id: spaceId, active: true },
    select: { id: true },
  });
  if (!space) throw new Error("El salón no pertenece a esta organización.");
}

/**
 * El profe a cargo de un grupo NUEVO cuando el form no lo trae (S7): en una INDEPENDENT
 * es el owner (el único profe, alcance 4 — el selector ni existe); en un STUDIO queda
 * sin asignar hasta que un admin lo asigne.
 */
async function resolveTeacherId(
  orgId: string,
  teacherId: string | null | undefined,
): Promise<string | null> {
  if (teacherId) {
    await assertTeacherInOrg(orgId, teacherId);
    return teacherId;
  }
  if (teacherId === null) return null;

  const org = withOrg(orgId);
  const organization = await org.organization.findUnique({
    where: { id: orgId },
    select: { type: true },
  });
  if (organization?.type !== "INDEPENDENT") return null;

  const owner = await org.teacherProfile.findFirst({
    where: { kind: "OWNER_TEACHER" },
    select: { id: true },
  });
  return owner?.id ?? null;
}

export async function listGroups(
  orgId: string,
  scope: DataScope,
  options: { includeInactive?: boolean } = {},
): Promise<GroupListItem[]> {
  const rows = await withOrg(orgId).classGroup.findMany({
    where: {
      ...(options.includeInactive ? {} : { active: true }),
      ...groupScopeWhere(scope),
    },
    orderBy: { name: "asc" },
    select: LIST_FIELDS,
  });

  return rows.map(toListItem);
}

/**
 * `null` si no existe O si es de otra organización (withOrg no lo deja ver) O si queda
 * fuera del scope del actor (S7): las tres respuestas son la misma, sin confirmar nada.
 */
export async function getGroup(
  orgId: string,
  scope: DataScope,
  groupId: string,
): Promise<GroupListItem | null> {
  const row = await withOrg(orgId).classGroup.findUnique({
    where: { id: groupId, AND: [groupScopeWhere(scope)] },
    select: LIST_FIELDS,
  });

  return row ? toListItem(row) : null;
}

/**
 * Alta (HU3.1): grupo + franjas en UNA escritura anidada (una transacción). Solo
 * owner/admin (decisión S7): la action lo exige por rol, acá no entra scope.
 */
export async function createGroup(orgId: string, input: GroupInput): Promise<{ id: string }> {
  await assertDisciplineInOrg(orgId, input.disciplineId);
  const teacherId = await resolveTeacherId(orgId, input.teacherId);

  // Salón (S8): opcional siempre; ajeno o inactivo no pasa. En una INDEPENDENT no hay
  // salones que referenciar, así que cualquier spaceId forjado muere acá mismo.
  const spaceId = input.spaceId ?? null;
  if (spaceId) await assertSpaceInOrg(orgId, spaceId);

  return withOrg(orgId).classGroup.create({
    data: {
      orgId,
      name: input.name,
      disciplineId: input.disciplineId,
      teacherId,
      spaceId,
      defaultPrice: input.defaultPrice,
      slots: {
        // orgId EXPLÍCITO: la escritura anidada no pasa por el hook del hijo.
        create: input.slots.map((slot) => ({
          orgId,
          weekday: slot.weekday,
          startTime: slot.startTime,
          durationMin: slot.durationMin,
        })),
      },
    },
    select: { id: true },
  });
}

/**
 * Edición (HU3.1): diff de franjas POR ID, nunca borrar-todo-y-recrear.
 *
 * Borrar una franja arrastra sus excepciones por cascada (canceladas/reprogramadas), así
 * que un cambio de nombre no puede costar historial. Reglas:
 * - misma franja, cambia hora/duración → update in place: sus excepciones SOBREVIVEN
 *   (las fechas siguen siendo ocurrencias válidas del mismo día de semana);
 * - cambia el weekday → identidad NUEVA (delete + create): "moví la clase de martes a
 *   miércoles" invalida las excepciones viejas — se pierden a propósito;
 * - franja ausente del input → delete (y sus excepciones se van con ella; la UI lo
 *   advierte, Componentes §3.15);
 * - franja sin id (o con un id que no es de este grupo) → create.
 *
 * Todo en una transacción del cliente acotado. Los where de franjas llevan `groupId`
 * además del id: el scope de org no alcanza contra OTRO grupo de la misma org.
 */
export async function updateGroup(
  orgId: string,
  scope: DataScope,
  groupId: string,
  input: GroupInput,
): Promise<{ id: string }> {
  await assertDisciplineInOrg(orgId, input.disciplineId);

  const org = withOrg(orgId);

  // El scope decide QUÉ grupos existen para el actor (S7): para un teacher, un grupo
  // ajeno directamente "no existe" — mismo mensaje que una referencia forjada.
  const editable = await org.classGroup.findUnique({
    where: { id: groupId, AND: [groupScopeWhere(scope)] },
    select: { id: true },
  });
  if (!editable) throw new Error("El grupo no pertenece a esta organización.");

  // Y decide QUÉ campos puede tocar (decisión S7, sesión con Dolores): el teacher edita
  // nombre, disciplina y horarios de SUS grupos; el precio de referencia y el profe a
  // cargo son de owner/admin — acá se fuerzan a quedar como están, decida lo que decida
  // la pantalla. `input.teacherId === undefined` también es "no tocar" (la edición en
  // una INDEPENDENT no trae selector y no debe pisar nada).
  const isTeacher = scope.kind === "teacher";

  let teacherAssignment: { teacherId: string | null } | undefined;
  if (!isTeacher && input.teacherId !== undefined) {
    if (input.teacherId) await assertTeacherInOrg(orgId, input.teacherId);
    teacherAssignment = { teacherId: input.teacherId };
  }

  // El salón (S8) sigue la misma regla que el profe a cargo: es un recurso compartido
  // del estudio — un teacher no lo toca, se fuerza como está.
  let spaceAssignment: { spaceId: string | null } | undefined;
  if (!isTeacher && input.spaceId !== undefined) {
    if (input.spaceId) await assertSpaceInOrg(orgId, input.spaceId);
    spaceAssignment = { spaceId: input.spaceId };
  }

  const groupData = {
    name: input.name,
    disciplineId: input.disciplineId,
    ...(isTeacher ? {} : { defaultPrice: input.defaultPrice }),
    ...(teacherAssignment ?? {}),
    ...(spaceAssignment ?? {}),
  };

  const current = await org.scheduleSlot.findMany({
    where: { groupId },
    select: { id: true, weekday: true },
  });
  const currentById = new Map(current.map((slot) => [slot.id, slot]));

  const kept = new Set<string>();
  const toUpdate: { id: string; startTime: string; durationMin: number }[] = [];
  const toCreate: SlotInput[] = [];

  for (const slot of input.slots) {
    const existing = slot.id ? currentById.get(slot.id) : undefined;

    if (existing && existing.weekday === slot.weekday) {
      kept.add(existing.id);
      toUpdate.push({ id: existing.id, startTime: slot.startTime, durationMin: slot.durationMin });
    } else {
      toCreate.push(slot);
    }
  }

  const toDelete = current.filter((slot) => !kept.has(slot.id)).map((slot) => slot.id);

  await org.$transaction([
    // Primero el grupo: si es ajeno, P2025 aborta la transacción antes de tocar franjas.
    org.classGroup.update({
      where: { id: groupId, AND: [groupScopeWhere(scope)] },
      data: groupData,
      select: { id: true },
    }),
    ...toDelete.map((id) => org.scheduleSlot.delete({ where: { id, groupId } })),
    ...toUpdate.map((slot) =>
      org.scheduleSlot.update({
        where: { id: slot.id, groupId },
        data: { startTime: slot.startTime, durationMin: slot.durationMin },
      }),
    ),
    ...(toCreate.length > 0
      ? [
          org.scheduleSlot.createMany({
            // orgId explícito (el hook lo re-inyecta igual): el tipo lo exige y es el
            // mismo orgId ya validado.
            data: toCreate.map((slot) => ({
              orgId,
              groupId,
              weekday: slot.weekday,
              startTime: slot.startTime,
              durationMin: slot.durationMin,
            })),
          }),
        ]
      : []),
  ]);

  return { id: groupId };
}

/**
 * Baja/reactivación del grupo (RN9: lógica). Acción propia y no parte de `updateGroup`:
 * el switch "Grupo activo" aplica al instante (Componentes §3.2).
 */
export async function setGroupActive(
  orgId: string,
  groupId: string,
  active: boolean,
): Promise<void> {
  await withOrg(orgId).classGroup.update({
    where: { id: groupId },
    data: { active },
    select: { id: true },
  });
}

/**
 * Disciplina "al vuelo" desde el form de grupo (HU3.1). Upsert sobre `[orgId, name]`:
 * repetirla no duplica, devuelve la existente.
 */
export async function createDiscipline(
  orgId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  return withOrg(orgId).discipline.upsert({
    where: { orgId_name: { orgId, name } },
    create: { orgId, name },
    update: {},
    select: { id: true, name: true },
  });
}
