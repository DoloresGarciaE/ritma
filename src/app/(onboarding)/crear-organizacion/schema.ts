import { z } from "zod";

/**
 * Validación del wizard, compartida por el cliente y la server action: el mismo schema
 * valida antes de enviar y al recibir. Va en su propio módulo porque un archivo
 * `"use server"` solo puede exportar funciones async.
 */

export const ORG_TYPES = ["INDEPENDENT", "STUDIO"] as const;

/** Las cinco del glosario del Plan (§3). El resto las escribe cada organización. */
export const DISCIPLINE_SUGGESTIONS = ["Árabe", "Folklore", "Funcional", "Canto", "Inglés"];

export const MAX_DISCIPLINE_LENGTH = 40;

/** Sin espacios de más: "  Danza   árabe " → "Danza árabe". */
export function normalizeDiscipline(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export const createOrgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Poné el nombre de tu organización.")
    .max(60, "El nombre no puede tener más de 60 caracteres."),
  type: z.enum(ORG_TYPES, {
    error: "Elegí una de las dos opciones.",
  }),
  disciplines: z
    .array(
      z.string().transform(normalizeDiscipline).pipe(z.string().min(1).max(MAX_DISCIPLINE_LENGTH)),
    )
    .min(1, "Elegí al menos una disciplina. Después vas a poder agregar más.")
    .max(20, "Por ahora, máximo 20 disciplinas."),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type CreateOrgField = keyof CreateOrgInput;

export type CreateOrgState = {
  errors?: Partial<Record<CreateOrgField, string>>;
  formError?: string;
};

export const EMPTY_STATE: CreateOrgState = {};

/** Primer mensaje por campo. Mismo mapeo del lado del cliente y del servidor. */
export function toFieldErrors(error: z.ZodError): CreateOrgState["errors"] {
  const errors: NonNullable<CreateOrgState["errors"]> = {};

  for (const issue of error.issues) {
    const field = issue.path[0] as CreateOrgField | undefined;
    if (field) errors[field] ??= issue.message;
  }

  return errors;
}
