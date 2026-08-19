import { civilToDb, dbToCivil, addDays, weekdayOf } from "@/lib/dates";
import { withOrg } from "@/lib/db";
import { DISCIPLINE_COLOR_COUNT } from "@/lib/discipline-colors";

import { groupScopeWhere, type DataScope } from "./permissions";
import {
  occurrencesForRange,
  type Occurrence,
  type SessionException,
  type SlotInfo,
} from "./schedule";

/**
 * Servicios de sesiones (HU3.2, HU3.3, RN8): juntan los datos para el motor puro
 * (schedule.ts) y persisten las EXCEPCIONES.
 *
 * Cancelar/reprogramar es un upsert por `(slotId, date)`: la primera vez crea la fila,
 * repetirlo la actualiza — idempotente por construcción. Restablecer BORRA la fila:
 * volver a la verdad calculada, sin filas zombi (una fila = un desvío vigente).
 *
 * Defensa de referencia cruzada (límite conocido de withOrg): `slotId` viene del
 * cliente, y un FK no distingue tenants — la franja se verifica contra la org ANTES de
 * escribir. Y la fecha tiene que ser una ocurrencia REAL de esa franja (mismo weekday):
 * sin eso, una request forjada podría sembrar excepciones en fechas que no existen.
 */

export type AgendaOccurrence = Occurrence & {
  groupName: string;
  disciplineName: string;
  /** Numérico plano: `Decimal` no cruza a un client component. */
  defaultPrice: number;
  /** Estable por orden de creación de la disciplina, ya módulo N (lib/discipline-colors). */
  colorIndex: number;
  /** Profe a cargo (S7): se muestra en el bloque de la agenda del ESTUDIO; null = sin asignar. */
  teacherName: string | null;
};

export type AgendaWeek = {
  /** Lunes, fecha civil. */
  weekStart: string;
  occurrences: AgendaOccurrence[];
};

/**
 * La semana de la agenda: franjas de los grupos ACTIVOS + excepciones fusionadas.
 *
 * Las excepciones se buscan por fecha original EN la semana **o** `movedToDate` EN la
 * semana (índices `[orgId, date]` y `[orgId, movedToDate]`): así entran también las
 * reprogramadas HACIA esta semana desde otra.
 *
 * El `scope` (S7) filtra los GRUPOS: un teacher ve solo la semana de los suyos. Las
 * excepciones se traen igual completas — el motor descarta solo las de slots ausentes
 * (huérfanas por construcción, ver schedule.ts).
 */
export async function weekData(
  orgId: string,
  scope: DataScope,
  weekStart: string,
): Promise<AgendaWeek> {
  const weekEnd = addDays(weekStart, 6);
  const org = withOrg(orgId);

  const [groups, disciplines, exceptionRows] = await Promise.all([
    org.classGroup.findMany({
      where: { active: true, ...groupScopeWhere(scope) },
      select: {
        id: true,
        name: true,
        defaultPrice: true,
        disciplineId: true,
        discipline: { select: { name: true } },
        teacher: { select: { displayName: true } },
        slots: { select: { id: true, weekday: true, startTime: true, durationMin: true } },
      },
    }),
    // El orden de creación define el color (spec de color §4). Desempate por id: las
    // disciplinas del wizard nacen en un createMany y comparten timestamp.
    org.discipline.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
    org.classSession.findMany({
      where: {
        OR: [
          { date: { gte: civilToDb(weekStart), lte: civilToDb(weekEnd) } },
          { movedToDate: { gte: civilToDb(weekStart), lte: civilToDb(weekEnd) } },
        ],
      },
      select: {
        slotId: true,
        date: true,
        status: true,
        note: true,
        movedToDate: true,
        movedToStartTime: true,
      },
    }),
  ]);

  const colorIndexByDiscipline = new Map(
    disciplines.map((d, index) => [d.id, index % DISCIPLINE_COLOR_COUNT]),
  );

  const slots: SlotInfo[] = groups.flatMap((group) =>
    group.slots.map((slot) => ({ ...slot, groupId: group.id })),
  );

  const exceptions: SessionException[] = exceptionRows.map((row) => ({
    slotId: row.slotId,
    date: dbToCivil(row.date),
    status: row.status,
    note: row.note,
    movedToDate: row.movedToDate ? dbToCivil(row.movedToDate) : null,
    movedToStartTime: row.movedToStartTime,
  }));

  const groupById = new Map(groups.map((group) => [group.id, group]));

  const occurrences = occurrencesForRange(slots, exceptions, {
    from: weekStart,
    to: weekEnd,
  }).map((occurrence): AgendaOccurrence => {
    const group = groupById.get(occurrence.groupId)!;
    return {
      ...occurrence,
      groupName: group.name,
      disciplineName: group.discipline.name,
      defaultPrice: group.defaultPrice.toNumber(),
      colorIndex: colorIndexByDiscipline.get(group.disciplineId) ?? 0,
      teacherName: group.teacher?.displayName ?? null,
    };
  });

  return { weekStart, occurrences };
}

/**
 * La franja, verificada contra la org Y contra el scope del actor (S7) — o throw: acá
 * solo se llega con request forjada. Para un teacher, la franja de un grupo ajeno "no
 * pertenece", igual que la de otra org: la misma respuesta no confirma nada.
 */
async function assertSlotInScope(
  orgId: string,
  scope: DataScope,
  slotId: string,
  date: string,
): Promise<{ groupId: string }> {
  const slot = await withOrg(orgId).scheduleSlot.findUnique({
    where: { id: slotId, group: groupScopeWhere(scope) },
    select: { groupId: true, weekday: true },
  });
  if (!slot) throw new Error("La franja no pertenece a esta organización.");
  if (weekdayOf(date) !== slot.weekday) {
    throw new Error("Esa fecha no es una ocurrencia de esta franja.");
  }
  return { groupId: slot.groupId };
}

/** Cancela SOLO esa fecha (HU3.3, RN8). Una movida se cancela donde está: movedTo queda. */
export async function cancelSession(
  orgId: string,
  scope: DataScope,
  input: { slotId: string; date: string; note?: string | null },
): Promise<void> {
  const { groupId } = await assertSlotInScope(orgId, scope, input.slotId, input.date);
  const date = civilToDb(input.date);

  await withOrg(orgId).classSession.upsert({
    where: { slotId_date: { slotId: input.slotId, date } },
    create: {
      orgId,
      groupId,
      slotId: input.slotId,
      date,
      status: "CANCELLED",
      note: input.note ?? null,
    },
    update: {
      status: "CANCELLED",
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
    select: { id: true },
  });
}

/**
 * Mueve SOLO esa fecha (HU3.3): la identidad `(slotId, date)` no cambia; la nueva
 * posición vive en `movedTo*`. Mover una cancelada la DES-cancela (status vuelve a
 * SCHEDULED): coherente con la UI, que a una cancelada solo le ofrece restablecer.
 */
export async function rescheduleSession(
  orgId: string,
  scope: DataScope,
  input: { slotId: string; date: string; movedToDate: string; movedToStartTime: string },
): Promise<void> {
  const { groupId } = await assertSlotInScope(orgId, scope, input.slotId, input.date);
  const date = civilToDb(input.date);
  const movedToDate = civilToDb(input.movedToDate);

  await withOrg(orgId).classSession.upsert({
    where: { slotId_date: { slotId: input.slotId, date } },
    create: {
      orgId,
      groupId,
      slotId: input.slotId,
      date,
      status: "SCHEDULED",
      movedToDate,
      movedToStartTime: input.movedToStartTime,
    },
    update: {
      status: "SCHEDULED",
      movedToDate,
      movedToStartTime: input.movedToStartTime,
    },
    select: { id: true },
  });
}

/**
 * Restablece la ocurrencia: BORRA la excepción y la verdad vuelve a ser la calculada.
 * Sirve igual para una cancelada y para una movida. Una `note` previa se pierde con la
 * fila (documentado). Inexistente o ajena → P2025.
 */
export async function restoreSession(
  orgId: string,
  scope: DataScope,
  input: { slotId: string; date: string },
): Promise<void> {
  await withOrg(orgId).classSession.delete({
    where: {
      slotId_date: { slotId: input.slotId, date: civilToDb(input.date) },
      group: groupScopeWhere(scope),
    },
    select: { id: true },
  });
}
