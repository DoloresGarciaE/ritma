/**
 * Colores de disciplina (Componentes §3.7, Color §4): la barra del bloque de sesión.
 *
 * La paleta son N tokens semánticos (`--discipline-1..N`, definidos en globals.css y en
 * la spec de color). La asignación es ESTABLE: índice de la disciplina por orden de
 * creación en la org (createdAt asc, desempate id asc), cíclica módulo N — la calcula
 * `weekData` (sessions.ts) y acá solo se traduce a clase.
 *
 * Ampliar la paleta = una fila en la spec de color + un token en globals.css + una
 * entrada acá. Nada más.
 */

export const DISCIPLINE_COLOR_CLASSES = [
  "bg-discipline-1",
  "bg-discipline-2",
  "bg-discipline-3",
] as const;

export const DISCIPLINE_COLOR_COUNT = DISCIPLINE_COLOR_CLASSES.length;

export function disciplineColorClass(colorIndex: number): string {
  return DISCIPLINE_COLOR_CLASSES[
    ((colorIndex % DISCIPLINE_COLOR_COUNT) + DISCIPLINE_COLOR_COUNT) % DISCIPLINE_COLOR_COUNT
  ];
}
