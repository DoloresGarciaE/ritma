import { z } from "zod";

import { toE164 } from "@/lib/students";

/**
 * Validación del alumno, compartida por el formulario y la server action: el mismo schema
 * valida antes de enviar y al recibir. Va en su propio módulo porque un archivo `"use server"`
 * solo puede exportar funciones async.
 */

export const MAX_NAME_LENGTH = 80;
export const MAX_NOTE_LENGTH = 500;

/**
 * El teléfono es OPCIONAL, pero si lo escribís tiene que ser real: se guarda en E.164 para
 * que wa.me funcione (S5). El profe tipea "11 5555-4433" y `transform` lo convierte a
 * "+541155554433"; si no parsea, error concreto junto al campo (Componentes §3.2).
 */
const phoneField = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;

    const e164 = toE164(value);
    if (!e164) {
      ctx.addIssue({
        code: "custom",
        message: "Ingresá un teléfono con código de área. Ej: 11 5555-4433",
      });
      return z.NEVER;
    }

    return e164;
  });

/** Un texto opcional: vacío significa "no hay dato", no cadena vacía. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

/** Alta express (HU2.1): solo nombre y teléfono. Todo lo demás se completa después. */
export const quickCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Poné el nombre del alumno.")
    .max(MAX_NAME_LENGTH, `El nombre no puede tener más de ${MAX_NAME_LENGTH} caracteres.`),
  phone: phoneField,
});

/** La ficha completa (HU2.2). */
export const studentSchema = quickCreateSchema.extend({
  email: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      if (!z.email().safeParse(value).success) {
        ctx.addIssue({ code: "custom", message: "Ese email no parece válido." });
        return z.NEVER;
      }
      return value;
    }),
  note: optionalText(MAX_NOTE_LENGTH),
});

export type QuickCreateInput = z.infer<typeof quickCreateSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type StudentField = keyof StudentInput;

export type StudentFormState = {
  errors?: Partial<Record<StudentField, string>>;
  formError?: string;
};

export const EMPTY_STATE: StudentFormState = {};

/** Primer mensaje por campo. Mismo mapeo del lado del cliente y del servidor. */
export function toFieldErrors(error: z.ZodError): StudentFormState["errors"] {
  const errors: NonNullable<StudentFormState["errors"]> = {};

  for (const issue of error.issues) {
    const field = issue.path[0] as StudentField | undefined;
    if (field) errors[field] ??= issue.message;
  }

  return errors;
}
