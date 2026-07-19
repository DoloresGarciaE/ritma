import { addDays, weekdayOf } from "@/lib/dates";

/**
 * El motor de la agenda (S2): calcula las ocurrencias de un rango de fechas al vuelo,
 * fusionando las franjas recurrentes con sus excepciones persistidas.
 *
 * Las sesiones NO se materializan (plan-implementación S2): una semana normal son cero
 * filas en la base. `ClassSession` guarda solo los DESVÍOS — cancelada, reprogramada o
 * anotada — identificados por `(slotId, date)` con `date` = la fecha civil ORIGINAL.
 *
 * Función pura: recibe datos, devuelve ocurrencias. Sin base, sin zona horaria (el
 * weekday de una fecha civil no depende de ninguna), sin reloj. Quién junta los datos es
 * `sessions.ts`; el contrato está en el JSDoc de `occurrencesForRange`.
 */

export type SessionStatusValue = "SCHEDULED" | "CANCELLED" | "DONE";

export type SlotInfo = {
  id: string;
  groupId: string;
  /** 0–6 convención JS (0 = domingo). */
  weekday: number;
  /** Hora local de la org, "HH:mm". */
  startTime: string;
  durationMin: number;
};

export type SessionException = {
  slotId: string;
  /** Fecha civil ORIGINAL de la ocurrencia ("yyyy-MM-dd") — su identidad, aun movida. */
  date: string;
  status: SessionStatusValue;
  note: string | null;
  /** Si la ocurrencia se reprogramó: dónde se muestra ahora. Van siempre juntos. */
  movedToDate: string | null;
  movedToStartTime: string | null;
};

export type Occurrence = {
  slotId: string;
  groupId: string;
  /** Fecha y hora donde SE MUESTRA (las nuevas, si está reprogramada). */
  date: string;
  startTime: string;
  durationMin: number;
  status: SessionStatusValue;
  /** La posición original (== date/startTime si no está movida). */
  originalDate: string;
  originalStartTime: string;
  moved: boolean;
  note: string | null;
};

/** La primera fecha ≥ `from` que cae en `weekday`. */
function firstOnOrAfter(from: string, weekday: number): string {
  return addDays(from, (weekday - weekdayOf(from) + 7) % 7);
}

/**
 * Ocurrencias de `slots` en `[from, to]` (inclusive), con `exceptions` aplicadas.
 *
 * Contrato con el caller (sessions.ts):
 * - `slots` son las franjas de los grupos ACTIVOS: un grupo inactivo no manda franjas, y
 *   sus excepciones sueltas se ignoran acá (no explotan).
 * - `exceptions` tiene que incluir las de fecha original EN el rango **y** las movidas
 *   HACIA el rango desde afuera (query por `date` OR `movedToDate` — para eso existe el
 *   índice `[orgId, movedToDate]`).
 *
 * Reglas de fusión:
 * - Sin fila → SCHEDULED en su lugar.
 * - CANCELLED → tachada; si además tiene `movedTo*`, se tacha en la posición MOVIDA
 *   (se movió primero y se canceló después: se tacha donde la gente la esperaba).
 * - `movedTo*` con status SCHEDULED/DONE → desaparece del origen y se emite en destino,
 *   `moved: true`, conservando `originalDate`/`originalStartTime`.
 * - Solo `note` → en su lugar, con la nota.
 * - Toda posición fuera del rango no se emite (ni origen ni destino).
 */
export function occurrencesForRange(
  slots: SlotInfo[],
  exceptions: SessionException[],
  range: { from: string; to: string },
): Occurrence[] {
  const byKey = new Map<string, SessionException>();
  for (const ex of exceptions) byKey.set(`${ex.slotId}|${ex.date}`, ex);

  const slotById = new Map(slots.map((slot) => [slot.id, slot]));

  // Los strings "yyyy-MM-dd" comparan bien lexicográficamente; "HH:mm" también.
  const inRange = (date: string) => date >= range.from && date <= range.to;

  const out: Occurrence[] = [];

  const emit = (slot: SlotInfo, ex: SessionException | undefined, originalDate: string): void => {
    if (!ex) {
      out.push({
        slotId: slot.id,
        groupId: slot.groupId,
        date: originalDate,
        startTime: slot.startTime,
        durationMin: slot.durationMin,
        status: "SCHEDULED",
        originalDate,
        originalStartTime: slot.startTime,
        moved: false,
        note: null,
      });
      return;
    }

    const moved = ex.movedToDate !== null;
    const shownDate = ex.movedToDate ?? originalDate;
    const shownTime = moved ? (ex.movedToStartTime ?? slot.startTime) : slot.startTime;

    if (!inRange(shownDate)) return;

    out.push({
      slotId: slot.id,
      groupId: slot.groupId,
      date: shownDate,
      startTime: shownTime,
      durationMin: slot.durationMin,
      status: ex.status,
      originalDate,
      originalStartTime: slot.startTime,
      moved,
      note: ex.note,
    });
  };

  // Pasada base: cada franja, semana a semana dentro del rango.
  for (const slot of slots) {
    for (let d = firstOnOrAfter(range.from, slot.weekday); d <= range.to; d = addDays(d, 7)) {
      emit(slot, byKey.get(`${slot.id}|${d}`), d);
    }
  }

  // Pasada de entrantes: reprogramadas HACIA el rango cuya fecha original quedó afuera
  // (las de origen adentro ya salieron en la pasada base).
  for (const ex of exceptions) {
    if (ex.movedToDate === null || !inRange(ex.movedToDate) || inRange(ex.date)) continue;

    const slot = slotById.get(ex.slotId);
    if (!slot) continue; // franja borrada o de grupo inactivo: no explota, no aparece

    emit(slot, ex, ex.date);
  }

  out.sort(
    (x, y) =>
      x.date.localeCompare(y.date) ||
      x.startTime.localeCompare(y.startTime) ||
      x.slotId.localeCompare(y.slotId),
  );

  return out;
}
