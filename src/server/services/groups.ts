import { withOrg } from "@/lib/db";

/**
 * Servicios de grupos (HU3.1).
 *
 * Todo pasa por `withOrg(orgId)` (patrón students.ts): datos YA validados por Zod en la
 * ruta; acá viven las DOS defensas que el hook no puede dar solo (límites conocidos de
 * withOrg, F0.6):
 *
 * 1. **Referencias cruzadas**: un FK no distingue tenants. `disciplineId` se verifica
 *    contra la org ANTES de escribir — una referencia ajena solo llega por request
 *    forjada, así que se corta con un throw (error boundary), no con un error de campo.
 * 2. **Escrituras anidadas**: crear franjas junto con el grupo no dispara el hook del
 *    hijo, así que el `orgId` de cada franja va explícito — el mismo ya validado.
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
  slots: SlotInput[];
};

const SLOT_FIELDS = { id: true, weekday: true, startTime: true, durationMin: true } as const;

const LIST_FIELDS = {
  id: true,
  name: true,
  active: true,
  defaultPrice: true,
  discipline: { select: { id: true, name: true } },
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

export async function listGroups(
  orgId: string,
  options: { includeInactive?: boolean } = {},
): Promise<GroupListItem[]> {
  const rows = await withOrg(orgId).classGroup.findMany({
    where: options.includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
    select: LIST_FIELDS,
  });

  return rows.map(toListItem);
}

/** `null` si no existe O si es de otra organización (withOrg no lo deja ver). */
export async function getGroup(orgId: string, groupId: string): Promise<GroupListItem | null> {
  const row = await withOrg(orgId).classGroup.findUnique({
    where: { id: groupId },
    select: LIST_FIELDS,
  });

  return row ? toListItem(row) : null;
}

/** Alta (HU3.1): grupo + franjas en UNA escritura anidada (una transacción). */
export async function createGroup(orgId: string, input: GroupInput): Promise<{ id: string }> {
  await assertDisciplineInOrg(orgId, input.disciplineId);

  return withOrg(orgId).classGroup.create({
    data: {
      orgId,
      name: input.name,
      disciplineId: input.disciplineId,
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
  groupId: string,
  input: GroupInput,
): Promise<{ id: string }> {
  await assertDisciplineInOrg(orgId, input.disciplineId);

  const org = withOrg(orgId);

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
      where: { id: groupId },
      data: {
        name: input.name,
        disciplineId: input.disciplineId,
        defaultPrice: input.defaultPrice,
      },
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
