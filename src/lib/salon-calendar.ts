/**
 * El armado del calendario por salón (S8, HU3.4): ocurrencias de UN día → columnas de
 * espacio sobre un eje horario, con los huecos EXPLÍCITOS ("Libre · HH:mm–HH:mm",
 * decisión de sesión). Puro: recibe datos, devuelve posiciones en MINUTOS relativos al
 * eje — la UI solo multiplica por su escala. Cero motor nuevo: las ocurrencias vienen
 * de `occurrencesForRange` vía `weekData`, ya filtradas al día y al scope del actor.
 *
 * Decisiones de sesión (ago 2026):
 * - Eje FIJO 8:00–22:00, estirado a la hora en punto si hay clases afuera: marco
 *   estable para comparar huecos día a día; un día vacío muestra el rango entero libre.
 * - "Sin salón" es la ÚLTIMA columna y solo aparece si ese día hay ocurrencias sin
 *   salón (para quien mira: un teacher solo aporta las suyas).
 * - Una cancelada se muestra (tachada, §3.7) y SIGUE ocupando su lugar: el calendario
 *   cuenta lo programado; recuperar ese hueco es restablecer o mover la sesión.
 * - Dos clases cruzadas en el MISMO salón (el conflicto que S8 ahora avisa) se ven
 *   lado a lado: cada bloque lleva su `lane` y la UI las desplaza — el choque se VE.
 */

export type SalonOccurrence = {
  startTime: string;
  durationMin: number;
  spaceId: string | null;
};

export type SalonColumnItem<T> =
  | { kind: "session"; occurrence: T; topMin: number; heightMin: number; lane: number }
  | { kind: "free"; from: string; to: string; topMin: number; heightMin: number };

export type SalonColumn<T> = {
  /** `null` = la columna "Sin salón". */
  spaceId: string | null;
  spaceName: string;
  items: SalonColumnItem<T>[];
};

export type SalonDay<T> = {
  /** Minutos desde las 00:00 (ej. 480 = 8:00). Alto total = axisEnd − axisStart. */
  axisStart: number;
  axisEnd: number;
  /** Las marcas de hora del eje: "08:00", "09:00", … */
  hourMarks: string[];
  columns: SalonColumn<T>[];
};

const AXIS_DEFAULT_START = 8 * 60;
const AXIS_DEFAULT_END = 22 * 60;
/** Un hueco más corto que esto no se etiqueta: queda como aire, sin cartel. */
const MIN_LABELED_FREE_MIN = 30;

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function buildSalonDay<T extends SalonOccurrence>(
  occurrences: readonly T[],
  spaces: readonly { id: string; name: string }[],
): SalonDay<T> {
  // Eje: fijo 8–22, estirado a la hora en punto si algo cae afuera.
  let axisStart = AXIS_DEFAULT_START;
  let axisEnd = AXIS_DEFAULT_END;
  for (const occurrence of occurrences) {
    const start = toMinutes(occurrence.startTime);
    const end = start + occurrence.durationMin;
    if (start < axisStart) axisStart = Math.floor(start / 60) * 60;
    if (end > axisEnd) axisEnd = Math.ceil(end / 60) * 60;
  }

  const hourMarks: string[] = [];
  for (let mark = axisStart; mark <= axisEnd; mark += 60) hourMarks.push(toTime(mark));

  const columnSpecs: { spaceId: string | null; spaceName: string }[] = spaces.map((space) => ({
    spaceId: space.id,
    spaceName: space.name,
  }));
  if (occurrences.some((occurrence) => occurrence.spaceId === null)) {
    columnSpecs.push({ spaceId: null, spaceName: "Sin salón" });
  }

  const columns = columnSpecs.map(({ spaceId, spaceName }) => {
    const own = occurrences
      .filter((occurrence) => occurrence.spaceId === spaceId)
      .map((occurrence) => ({
        occurrence,
        start: toMinutes(occurrence.startTime),
        end: toMinutes(occurrence.startTime) + occurrence.durationMin,
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const items: SalonColumnItem<T>[] = [];

    // Carriles para cruces DENTRO de la columna: cada bloque toma el primer carril
    // cuyo último bloque ya terminó — dos cruzadas quedan lado a lado.
    const laneEnds: number[] = [];
    for (const { occurrence, start, end } of own) {
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      items.push({
        kind: "session",
        occurrence,
        topMin: start - axisStart,
        heightMin: end - start,
        lane,
      });
    }

    // Huecos: los espacios sin NADA programado, sobre los intervalos ocupados
    // fusionados. Solo se etiquetan los de 30 minutos o más — menos que eso es aire.
    let cursor = axisStart;
    const frees: SalonColumnItem<T>[] = [];
    for (const { start, end } of own) {
      if (start - cursor >= MIN_LABELED_FREE_MIN) {
        frees.push({
          kind: "free",
          from: toTime(cursor),
          to: toTime(start),
          topMin: cursor - axisStart,
          heightMin: start - cursor,
        });
      }
      cursor = Math.max(cursor, end);
    }
    if (axisEnd - cursor >= MIN_LABELED_FREE_MIN) {
      frees.push({
        kind: "free",
        from: toTime(cursor),
        to: toTime(axisEnd),
        topMin: cursor - axisStart,
        heightMin: axisEnd - cursor,
      });
    }

    return { spaceId, spaceName, items: [...frees, ...items] };
  });

  return { axisStart, axisEnd, hourMarks, columns };
}
