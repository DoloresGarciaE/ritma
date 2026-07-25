import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Dominio de alumnos: funciones PURAS, sin base y sin React. Las usan por igual el
 * cliente (validación del formulario) y el servidor (servicios y seed).
 */

/** El país por defecto: el profe tipea "11 5555-4433" y no piensa en el +54. */
export const DEFAULT_COUNTRY: CountryCode = "AR";

/**
 * El nombre, listo para buscar: minúsculas, sin tildes y con los espacios colapsados.
 * "  Iñaki  Pérez " → "inaki perez".
 *
 * Se guarda en `Student.searchName` en cada escritura, así la búsqueda es una query normal
 * de Prisma (indexada, sin la extensión `unaccent` y sin SQL crudo, que se saltearía withOrg).
 *
 * NFD separa cada letra de su tilde y \p{Diacritic} borra las tildes sueltas. La ñ también
 * se normaliza a n: es lo que se quiere en una búsqueda (tipear "peña" encuentra "Pena" y
 * viceversa).
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Un teléfono tal como lo tipea el profe → E.164, que es lo que necesita wa.me (S5).
 * "11 5555-4433" → "+541155554433". Devuelve `null` si no es un número válido.
 *
 * Se guarda SIEMPRE en E.164: el formato lindo es cosa de la vista.
 */
export function toE164(input: string, country: CountryCode = DEFAULT_COUNTRY): string | null {
  const parsed = parsePhoneNumberFromString(input, country);
  return parsed?.isValid() ? parsed.number : null;
}

/**
 * E.164 → como se lee en pantalla. "+541155554433" → "011 15-5555-4433".
 * Si no parsea (dato viejo o raro), se muestra tal cual: mejor eso que esconderlo.
 */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatNational() ?? e164;
}

/**
 * Iniciales para el avatar (Componentes §3.11): dos letras. "Sofía Herrera" → "SH";
 * "Malena" → "M". Sin fotos de alumnos en el MVP, así que esto es toda la identidad visual.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : "";

  return (first + last).toUpperCase();
}
