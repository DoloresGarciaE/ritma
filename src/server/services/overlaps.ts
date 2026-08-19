import { withOrg } from "@/lib/db";
import { fullWeekday } from "@/lib/format";

import { groupScopeWhere, type DataScope } from "./permissions";

/**
 * Solapamientos de horarios (S8, HU3.1). El ticket original de S2 los dejó pasar a
 * propósito; con `Space` (S8) y `teacherId` (S7) los cruces se clasifican:
 *
 * - **mismo salón** y rangos que se cruzan → conflicto FUERTE: imposibilidad física.
 * - **mismo profe** en dos grupos que se cruzan → FUERTE: una persona no está en dos aulas.
 * - salones DISTINTOS (los dos asignados) → silencio: dos clases a la vez es la vida
 *   normal de un estudio.
 * - alguno SIN salón → aviso SUAVE genérico: no podemos saber si comparten espacio.
 *
 * Siempre advertencia/confirmación, NUNCA bloqueo (decisión sostenida del ticket
 * original): la agenda de la vida real le gana a lo que el sistema cree saber.
 * Espalda-con-espalda (19:00–20:00 y 20:00–21:00) NO es cruce. Solo orgs STUDIO: en
 * una INDEPENDENT esto no corre (regla dura S8 — ni un pixel nuevo ahí).
 *
 * El núcleo es PURO (recibe candidato y vecinos, devuelve conflictos — testeable sin
 * base); `detectGroupOverlaps` junta los datos y aplica el scope de S7: un vecino
 * fuera del alcance del actor participa de la física pero NO se nombra.
 */

export type OverlapSlot = { weekday: number; startTime: string; durationMin: number };

export type OverlapCandidate = {
  /** Al editar: el propio grupo queda excluido de la comparación. */
  groupId?: string;
  spaceId: string | null;
  teacherId: string | null;
  slots: OverlapSlot[];
};

export type OverlapNeighbor = {
  groupId: string;
  /** `null` = fuera del scope del actor (S7): el aviso no lo nombra. */
  groupName: string | null;
  spaceId: string | null;
  spaceName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  slots: OverlapSlot[];
};

export type ScheduleOverlap = {
  /** strong = imposibilidad física (salón o profe); soft = no podemos saberlo. */
  severity: "strong" | "soft";
  kind: "space" | "teacher" | "unknown-space";
  groupName: string | null;
  spaceName: string | null;
  teacherName: string | null;
  weekday: number;
  /** El rango del CRUCE (la intersección), "HH:mm" cada punta. */
  from: string;
  to: string;
};

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * El núcleo puro: cruza cada franja del candidato contra cada franja de cada vecino.
 * Un cruce produce UN conflicto (el más informativo): salón le gana a profe — si
 * comparten los dos, con la imposibilidad del salón alcanza para frenar.
 */
export function findScheduleOverlaps(
  candidate: OverlapCandidate,
  neighbors: OverlapNeighbor[],
): ScheduleOverlap[] {
  const overlaps: ScheduleOverlap[] = [];

  for (const slot of candidate.slots) {
    const start = toMinutes(slot.startTime);
    const end = start + slot.durationMin;

    for (const neighbor of neighbors) {
      if (candidate.groupId && neighbor.groupId === candidate.groupId) continue;

      const sameSpace =
        candidate.spaceId !== null &&
        neighbor.spaceId !== null &&
        candidate.spaceId === neighbor.spaceId;
      const sameTeacher =
        candidate.teacherId !== null &&
        neighbor.teacherId !== null &&
        candidate.teacherId === neighbor.teacherId;
      const spaceUnknown = candidate.spaceId === null || neighbor.spaceId === null;

      // Salones distintos y profes distintos: dos clases a la vez es lo normal.
      if (!sameSpace && !sameTeacher && !spaceUnknown) continue;

      for (const other of neighbor.slots) {
        if (other.weekday !== slot.weekday) continue;

        const otherStart = toMinutes(other.startTime);
        const otherEnd = otherStart + other.durationMin;
        const from = Math.max(start, otherStart);
        const to = Math.min(end, otherEnd);
        // Estricto: espalda-con-espalda (end == start) no es cruce.
        if (from >= to) continue;

        const kind = sameSpace ? "space" : sameTeacher ? "teacher" : "unknown-space";
        overlaps.push({
          severity: kind === "unknown-space" ? "soft" : "strong",
          kind,
          groupName: neighbor.groupName,
          spaceName: neighbor.spaceName,
          teacherName: neighbor.teacherName,
          weekday: slot.weekday,
          from: toTime(from),
          to: toTime(to),
        });
      }
    }
  }

  // Fuertes primero (la confirmación los lista arriba), después por día y hora.
  return overlaps.sort(
    (a, b) =>
      Number(b.severity === "strong") - Number(a.severity === "strong") ||
      ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) ||
      a.from.localeCompare(b.from),
  );
}

/** El texto de cada conflicto (voz de marca: concreto, sin culpar — Marca §4). */
export function overlapMessage(overlap: ScheduleOverlap): string {
  const day = fullWeekday(overlap.weekday);
  const range = `${overlap.from}–${overlap.to}`;
  const group = overlap.groupName ?? "otro grupo del estudio";

  if (overlap.kind === "space") {
    return `${overlap.spaceName} ya está ocupado el ${day} ${range} por ${group}.`;
  }
  if (overlap.kind === "teacher") {
    return `${overlap.teacherName} ya da clase el ${day} ${range} (${group}).`;
  }
  return `Se cruza con ${group} el ${day} ${range}. Sin salón asignado, no podemos saber si comparten espacio.`;
}

export type GroupOverlapInput = {
  /** Presente al editar (excluye el propio grupo y hereda sus valores forzados). */
  groupId?: string;
  slots: OverlapSlot[];
  /** `undefined` = conservar el valor actual del grupo (edición sin selector, o teacher). */
  spaceId?: string | null;
  teacherId?: string | null;
};

/**
 * Junta los datos y corre el núcleo. La comparación es ORG-COMPLETA a propósito — la
 * física del estudio no depende de quién mira —, pero los nombres de grupos fuera del
 * scope del actor se REDACTAN (S7): un teacher ve "otro grupo del estudio", el salón y
 * el horario; nunca el nombre ni el profe de un grupo ajeno.
 */
export async function detectGroupOverlaps(
  orgId: string,
  scope: DataScope,
  input: GroupOverlapInput,
): Promise<ScheduleOverlap[]> {
  const org = withOrg(orgId);

  // Regla dura S8: en una INDEPENDENT no corre nada de esto.
  const organization = await org.organization.findUnique({
    where: { id: orgId },
    select: { type: true },
  });
  if (organization?.type !== "STUDIO") return [];

  const groups = await org.classGroup.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      spaceId: true,
      teacherId: true,
      space: { select: { name: true } },
      teacher: { select: { displayName: true } },
      slots: { select: { weekday: true, startTime: true, durationMin: true } },
    },
  });

  const current = input.groupId ? groups.find((group) => group.id === input.groupId) : undefined;
  const candidate: OverlapCandidate = {
    groupId: input.groupId,
    spaceId: input.spaceId === undefined ? (current?.spaceId ?? null) : input.spaceId,
    teacherId: input.teacherId === undefined ? (current?.teacherId ?? null) : input.teacherId,
    slots: input.slots,
  };

  // Los ids del scope de S7: qué vecinos puede NOMBRAR el actor.
  const inScope =
    scope.kind === "all"
      ? null
      : new Set(
          groups
            .filter((group) => group.teacherId === scope.teacherProfileId)
            .map((group) => group.id),
        );

  const neighbors: OverlapNeighbor[] = groups.map((group) => {
    const visible = inScope === null || inScope.has(group.id);
    return {
      groupId: group.id,
      groupName: visible ? group.name : null,
      spaceId: group.spaceId,
      spaceName: group.space?.name ?? null,
      teacherId: group.teacherId,
      teacherName: visible ? (group.teacher?.displayName ?? null) : null,
      slots: group.slots,
    };
  });

  return findScheduleOverlaps(candidate, neighbors);
}
