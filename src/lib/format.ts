import { weekdayOf } from "@/lib/dates";

/**
 * Formato único de montos en toda la app: `$20.000` — punto de miles, sin
 * decimales salvo necesidad real (Marca §7.2, Componentes §4.2). Y desde S2, el de
 * fechas y horas: `mar 12/05` en listas (§4.2), `martes 12/05` en confirmaciones (§3.8).
 *
 * Los nombres de día y mes son tabla propia es-AR, no un locale de librería: son 19
 * strings que la spec fija, y así no dependen de qué trae el runtime.
 */

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/** `20000` → `"20.000"` · `20000.5` → `"20.000,50"` (sin símbolo) */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "";

  const rounded = Math.round(Math.abs(value) * 100) / 100;
  const [whole, cents] = rounded.toFixed(Number.isInteger(rounded) ? 0 : 2).split(".");
  const grouped = whole.replace(THOUSANDS, ".");
  const sign = value < 0 ? "-" : "";

  return cents ? `${sign}${grouped},${cents}` : `${sign}${grouped}`;
}

/** `20000` → `"$20.000"` · `-1500` → `"-$1.500"` (signo explícito, no solo color) */
export function formatMoney(value: number): string {
  const amount = formatAmount(value);
  if (!amount) return "";

  return amount.startsWith("-") ? `-$${amount.slice(1)}` : `$${amount}`;
}

/** `"$20.000"` | `"20.000"` | `"20000,50"` → número · vacío o inválido → `null` */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^\d,-]/g, "").replace(",", ".");
  if (!cleaned || cleaned === "-") return null;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fechas y horas (S2). Entrada: fechas civiles "yyyy-MM-dd" y horas "HH:mm".
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const WEEKDAYS_FULL = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;
const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;
const MONTHS_FULL = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** `2` → `"mar"` — para resúmenes de franjas ("mar 19:00 · jue 19:00"). */
export function shortWeekday(weekday: number): string {
  return WEEKDAYS_SHORT[weekday];
}

/** `2` → `"martes"` — para labels accesibles y confirmaciones. */
export function fullWeekday(weekday: number): string {
  return WEEKDAYS_FULL[weekday];
}

function partsOf(date: string): { day: string; month: string; monthIndex: number } {
  const [, month, day] = date.split("-");
  return { day: String(Number(day)), month, monthIndex: Number(month) - 1 };
}

/** `"2026-05-12"` → `"mar 12/05"` — el formato de listas (§4.2). */
export function formatListDate(date: string): string {
  const { day, month } = partsOf(date);
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${day.padStart(2, "0")}/${month}`;
}

/** `"2026-05-12"` → `"martes 12/05"` — para confirmaciones que nombran el objeto (§3.8). */
export function formatFullDayDate(date: string): string {
  const { day, month } = partsOf(date);
  return `${WEEKDAYS_FULL[weekdayOf(date)]} ${day.padStart(2, "0")}/${month}`;
}

/** `("2026-05-12", "2026-05-18")` → `"12–18 may"` · cruzando mes → `"27 jul – 2 ago"`. */
export function formatWeekRange(from: string, to: string): string {
  const f = partsOf(from);
  const t = partsOf(to);

  if (f.monthIndex === t.monthIndex) {
    return `${f.day}–${t.day} ${MONTHS_SHORT[t.monthIndex]}`;
  }
  return `${f.day} ${MONTHS_SHORT[f.monthIndex]} – ${t.day} ${MONTHS_SHORT[t.monthIndex]}`;
}

/** `"2026-03"` → `"Marzo 2026"` — el formato de períodos (§4.2), en título y selector. */
export function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  return `${MONTHS_FULL[Number(month) - 1]} ${year}`;
}

/** `"2026-05-12"` → `"12 de mayo de 2026"` — el formato de DOCUMENTOS (§4.2): comprobantes. */
export function formatDocumentDate(date: string): string {
  const [year] = date.split("-");
  const { day, monthIndex } = partsOf(date);
  return `${day} de ${MONTHS_FULL[monthIndex].toLowerCase()} de ${year}`;
}

/**
 * `([1, 3, 5], "19:00", 90)` → `"Lun, Mié y Vie · 19:00 · 90 min"` — el resumen de una
 * franja multi-día (§4.2, ticket horarios): el MISMO formato en el formulario, la lista
 * de grupos y donde haga falta leer un horario recurrente. Días lunes-primero, con "y"
 * antes del último; un solo día → `"Sáb · 10:00 · 90 min"`.
 */
export function formatFranja(weekdays: number[], startTime: string, durationMin: number): string {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const names = [...weekdays]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((weekday) => capitalize(WEEKDAYS_SHORT[weekday]));

  const days = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;

  return `${days} · ${startTime} · ${durationMin} min`;
}

/** `("19:00", 90)` → `"19:00–20:30"`. Cruza medianoche sin drama: `("23:30", 90)` → `"23:30–01:00"`. */
export function formatTimeRange(startTime: string, durationMin: number): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const end = (hours * 60 + minutes + durationMin) % (24 * 60);
  const endHours = String(Math.floor(end / 60)).padStart(2, "0");
  const endMinutes = String(end % 60).padStart(2, "0");
  return `${startTime}–${endHours}:${endMinutes}`;
}
