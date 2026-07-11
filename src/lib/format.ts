/**
 * Formato único de montos en toda la app: `$20.000` — punto de miles, sin
 * decimales salvo necesidad real (Marca §7.2, Componentes §4.2).
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
