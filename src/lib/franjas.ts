import { fullWeekday } from "@/lib/format";

/**
 * Franja multi-día (ticket "selección de horarios amigable"): concepto de UI, NO de
 * modelo. El formulario edita {días, hora, duración} y acá se EXPANDE a un ScheduleSlot
 * por día al guardar; al editar, los slots existentes se RE-AGRUPAN en franjas visuales
 * por (hora, duración). El schema y el motor de ocurrencias no saben que esto existe.
 *
 * Cada día lleva su `slotId` cuando el slot ya existe: así la expansión conserva la
 * identidad y el diff de `updateGroup` sigue decidiendo igual que siempre — cambiar
 * hora/duración es update in place (las excepciones sobreviven), sacar un día borra SU
 * slot (las excepciones de ese día se van por cascada, deliberado y advertido en §3.15).
 */

export type FranjaDay = {
  /** Convención JS, la misma de ScheduleSlot.weekday: 0 = domingo. */
  weekday: number;
  /** Presente = ese día ya existe como slot (la expansión conserva la identidad). */
  slotId?: string;
};

export type Franja = {
  days: FranjaDay[];
  startTime: string;
  durationMin: number;
};

export type FranjaSlot = {
  id?: string;
  weekday: number;
  startTime: string;
  durationMin: number;
};

/** Lunes-primero (RN10): la MISMA traducción de mondayOf/mondayFirst. */
const mondayFirst = (weekday: number) => (weekday + 6) % 7;

/**
 * Franjas → slots, un ScheduleSlot por día. Días ordenados lunes-primero y deduplicados
 * por weekday (defensa: los chips no dejan repetir, pero el payload podría). El `slotId`
 * viaja como `id`: el shape de salida es EXACTAMENTE el `SlotInput` que los servicios de
 * S2 ya esperan — el diff no se entera del cambio de formulario.
 */
export function expandFranjas(franjas: Franja[]): FranjaSlot[] {
  const slots: FranjaSlot[] = [];

  for (const franja of franjas) {
    const seen = new Set<number>();
    const days = [...franja.days].sort((a, b) => mondayFirst(a.weekday) - mondayFirst(b.weekday));

    for (const day of days) {
      if (seen.has(day.weekday)) continue;
      seen.add(day.weekday);
      slots.push({
        ...(day.slotId ? { id: day.slotId } : {}),
        weekday: day.weekday,
        startTime: franja.startTime,
        durationMin: franja.durationMin,
      });
    }
  }

  return slots;
}

/**
 * Slots → franjas visuales, agrupando por (hora, duración) — la vuelta de `expandFranjas`.
 * Dos slots con la misma hora pero DISTINTA duración son franjas distintas: no se
 * fusionan. El orden es el de primera aparición (el server ya lista lunes-primero) y los
 * días de cada franja quedan lunes-primero.
 */
export function groupSlots(
  slots: { id?: string; weekday: number; startTime: string; durationMin: number }[],
): Franja[] {
  const byShape = new Map<string, Franja>();

  for (const slot of slots) {
    const shape = `${slot.startTime}|${slot.durationMin}`;
    const franja = byShape.get(shape) ?? {
      days: [],
      startTime: slot.startTime,
      durationMin: slot.durationMin,
    };
    franja.days.push({ weekday: slot.weekday, ...(slot.id ? { slotId: slot.id } : {}) });
    byShape.set(shape, franja);
  }

  for (const franja of byShape.values()) {
    franja.days.sort((a, b) => mondayFirst(a.weekday) - mondayFirst(b.weekday));
  }
  return [...byShape.values()];
}

/**
 * Colisiones internas del formulario: el MISMO día con la MISMA hora en dos franjas
 * sería el mismo momento dos veces (mismo día en horarios distintos siempre fue válido).
 * Devuelve el mensaje que nombra cada conflicto — "Lunes 19:00 está repetido." — o null.
 * La duración no participa: dos franjas que arrancan juntas chocan aunque duren distinto.
 */
export function scheduleCollisionError(
  franjas: { days: { weekday: number }[]; startTime: string }[],
): string | null {
  const count = new Map<string, number>();

  for (const franja of franjas) {
    const seen = new Set<number>();
    for (const day of franja.days) {
      if (seen.has(day.weekday)) continue; // el dedupe de expandFranjas: no es colisión
      seen.add(day.weekday);
      const key = `${day.weekday}|${franja.startTime}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }

  const repeated = [...count.entries()]
    .filter(([, n]) => n > 1)
    .map(([key]) => {
      const [weekday, startTime] = key.split("|");
      return { weekday: Number(weekday), startTime };
    })
    .sort(
      (a, b) =>
        mondayFirst(a.weekday) - mondayFirst(b.weekday) || a.startTime.localeCompare(b.startTime),
    );

  if (repeated.length === 0) return null;

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const labels = repeated.map((r) => `${capitalize(fullWeekday(r.weekday))} ${r.startTime}`);

  return labels.length === 1
    ? `${labels[0]} está repetido.`
    : `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)} están repetidos.`;
}
