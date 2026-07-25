import type { z } from "zod";

/**
 * Primer mensaje de error por campo, con el `path[0]` del issue como campo. El mismo
 * mapeo corre del lado del cliente (al tocar el CTA) y del servidor (en la action):
 * un solo criterio de qué error se muestra junto a cada campo.
 */
export function toFieldErrors<TField extends string>(
  error: z.ZodError,
): Partial<Record<TField, string>> {
  const errors: Partial<Record<TField, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0] as TField | undefined;
    if (field !== undefined) errors[field] ??= issue.message;
  }

  return errors;
}
