/**
 * La plantilla de recordatorio (HU5.2–5.3): render puro, sin base y sin React.
 *
 * Cuatro variables y ni una más — las que el DoD de S5 exige que lleguen pre-armadas:
 * nombre, período, monto y alias. Una variable desconocida ({grupo}, un typo) queda
 * VISIBLE en el texto: mejor que el profe la vea en la vista previa a que se mande un
 * mensaje con un hueco silencioso.
 */

export type ReminderVars = {
  /** Nombre de pila del alumno ("Sofía"), como en el ejemplo normativo de Marca §4.2. */
  nombre: string;
  /** El período formateado ("Marzo 2026"). */
  periodo: string;
  /** La deuda del período formateada ("$20.000"). */
  monto: string;
  /** El alias/CBU de cobro de la org; vacío si no está cargado. */
  alias: string;
};

/** Para la ayuda del editor (§3.16): variable → qué pone. */
export const REMINDER_VARIABLES: { name: keyof ReminderVars; hint: string }[] = [
  { name: "nombre", hint: "el nombre de pila del alumno" },
  { name: "periodo", hint: "el período (Marzo 2026)" },
  { name: "monto", hint: "la deuda del período ($20.000)" },
  { name: "alias", hint: "tu alias o CBU de cobro" },
];

/**
 * El default es el ejemplo normativo de Marca §4.2 con las variables en el lugar de los
 * datos: la voz exacta que la spec aprueba (un emoji, canal conversacional; la deuda es
 * un dato, no un reproche).
 */
export const DEFAULT_REMINDER_TEMPLATE =
  "Hola {nombre} 👋 Te paso el resumen de {periodo}: {monto}. " +
  "Podés transferir a {alias}. ¡Gracias!";

/**
 * Sin alias cargado, la frase de la transferencia del default saldría rota ("Podés
 * transferir a ."): la org sin alias usa este default SIN esa oración. Solo aplica al
 * default — una plantilla propia con {alias} es del profe, y la vista previa la muestra.
 */
export const DEFAULT_REMINDER_TEMPLATE_NO_ALIAS =
  "Hola {nombre} 👋 Te paso el resumen de {periodo}: {monto}. ¡Gracias!";

/** El default que corresponde a la org: con o sin la frase del alias. */
export function defaultReminderTemplate(alias: string): string {
  return alias.trim() ? DEFAULT_REMINDER_TEMPLATE : DEFAULT_REMINDER_TEMPLATE_NO_ALIAS;
}

/**
 * Marca §4: emojis solo en canales conversacionales (WhatsApp) — el recordatorio por
 * EMAIL usa la MISMA plantilla (HU5.3) pero sale sin emojis. Se limpia el render, no la
 * plantilla: el profe escribe una sola.
 */
export function withoutEmojis(text: string): string {
  // ‍ (joiner de emojis compuestos) y ️ (variation selector) van escapados:
  // literales serían invisibles en el fuente.
  const emoji = new RegExp(
    "\\s?\\p{Extended_Pictographic}(?:\\u200D\\p{Extended_Pictographic})*\\uFE0F?",
    "gu",
  );
  return text
    .replace(emoji, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** `"Sofía Herrera"` → `"Sofía"` — el canal es conversacional, el apellido sobra. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Reemplaza {nombre}/{periodo}/{monto}/{alias}; lo que no es una variable queda igual. */
export function renderTemplate(template: string, vars: ReminderVars): string {
  return template.replace(/\{(nombre|periodo|monto|alias)\}/g, (_, key: keyof ReminderVars) =>
    String(vars[key] ?? ""),
  );
}
