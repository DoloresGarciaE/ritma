/**
 * Deep links de WhatsApp (HU5.2, MVP): `wa.me/{número}?text=…` abre el chat con el
 * mensaje pre-armado; el ENVÍO lo hace el profe en su WhatsApp. Gratis y sin fricción;
 * la Cloud API (envío automático) es de fase 3 y no entra acá.
 */

/**
 * `("+5491155554433", "Hola…")` → `https://wa.me/5491155554433?text=Hola%E2%80%A6`.
 *
 * El teléfono ya viene en E.164 desde el padrón (lib/students.ts); wa.me lo quiere SIN
 * el `+`. El texto va URL-encodeado entero (emojis incluidos).
 */
export function waLink(phoneE164: string, text: string): string {
  const digits = phoneE164.replace(/^\+/, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
