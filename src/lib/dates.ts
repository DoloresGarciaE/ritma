import { TZDate } from "@date-fns/tz";

/**
 * Fechas CIVILES como strings `"yyyy-MM-dd"` (RN10): la fecha de una clase es un dato de
 * calendario, no un instante UTC. Todo el cálculo es aritmética entera anclada en UTC —
 * una librería que opera en el huso del servidor acá sería un riesgo, no una ayuda.
 *
 * La zona horaria de la org interviene en UN solo lugar: decidir qué día es "hoy"
 * (`todayInTz`, con TZDate de @date-fns/tz). El resto ni la necesita: el weekday de una
 * fecha civil es el mismo en todo el planeta.
 *
 * Funciones puras, sin base y sin React (patrón de lib/students.ts): las usan los
 * servicios, el seed, el formateo y los tests.
 */

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

/** `"2026-07-20"` → timestamp UTC de esa medianoche. Solo para hacer cuentas acá adentro. */
function toUtc(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtc(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Forma válida Y fecha real: rechaza `"2026-02-30"`, no solo lo mal formateado. */
export function isCivilDate(value: string): boolean {
  if (!CIVIL_DATE.test(value)) return false;
  return fromUtc(toUtc(value)) === value;
}

/** Día de semana 0–6, convención JS (0 = domingo) — la misma de `ScheduleSlot.weekday`. */
export function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** El lunes de la semana de `date` (semana lunes → domingo). Un lunes es su propio lunes. */
export function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/**
 * Frontera con Prisma: una columna `@db.Date` viaja como `Date` a medianoche UTC.
 * Estos dos son el ÚNICO cruce permitido — ninguna `Date` sale de la capa de datos.
 */
export function civilToDb(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function dbToCivil(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Períodos "YYYY-MM" (S3, RN1/RN10): el mes de facturación es un dato de
// calendario, igual que la fecha civil — mismo trato, misma aritmética entera.
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Forma válida "YYYY-MM" con mes real (01–12). */
export function isPeriod(value: string): boolean {
  return PERIOD.test(value);
}

/** `"2026-07-15"` → `"2026-07"`: el período al que pertenece una fecha civil. */
export function periodOf(date: string): string {
  return date.slice(0, 7);
}

/** `("2026-07", -1)` → `"2026-06"` · `("2026-12", 1)` → `"2027-01"`. */
export function addMonths(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

/** Cantidad de días del período (`"2026-02"` → 28; `"2028-02"` → 29). */
export function daysInPeriod(period: string): number {
  const [year, month] = period.split("-").map(Number);
  // Día 0 del mes siguiente = último día de este mes (aritmética UTC, como todo acá).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * El día `day` del período como fecha civil, CLAMPEADO al rango real del mes:
 * `("2026-04", 31)` → `"2026-04-30"`. Es la regla del vencimiento (RN1): una org con
 * `dueDay` 31 vence el último día de los meses cortos, no nunca.
 */
export function dateInPeriod(period: string, day: number): string {
  const clamped = Math.min(Math.max(1, Math.trunc(day)), daysInPeriod(period));
  return `${period}-${String(clamped).padStart(2, "0")}`;
}

/**
 * "Hoy" como fecha civil EN LA ZONA DE LA ORG — no en la del servidor: a las 02:30 UTC
 * en Buenos Aires todavía es el día anterior. Zona inválida → default AR, sin tirar.
 */
export function todayInTz(timezone: string): string {
  let now: TZDate;
  try {
    now = TZDate.tz(timezone);
    if (Number.isNaN(now.getTime())) throw new Error("timezone inválida");
  } catch {
    now = TZDate.tz(DEFAULT_TIMEZONE);
  }

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
