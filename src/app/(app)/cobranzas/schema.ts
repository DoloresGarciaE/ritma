import { z } from "zod";

import { isCivilDate } from "@/lib/dates";
import { toFieldErrors as genericToFieldErrors } from "@/lib/forms";

/**
 * Validación de cobranzas (S3), compartida por formularios y server actions (patrón de
 * alumnos/schema.ts). Vive en cobranzas/ porque es SU dominio, aunque el sheet de
 * inscripción se abra desde la ficha del alumno y desde el detalle de sesión.
 */

const civilDateField = z.string().refine(isCivilDate, "Esa fecha no es válida.");

/** El mismo tope que la tarifa del grupo: Decimal(12,2) desborda con números gigantes. */
const priceField = z
  .number({ error: "Poné el precio." })
  .min(0, "El precio no puede ser negativo.")
  .max(9_999_999_999, "Ese precio es demasiado alto.");

/** Inscribir (HU4.1): alumno + grupo + plan + precio pactado + fecha de alta. */
export const enrollSchema = z.object({
  studentId: z.string().min(1, "Elegí un alumno."),
  groupId: z.string().min(1, "Elegí un grupo."),
  plan: z.enum(["MONTHLY", "DROP_IN"]),
  price: priceField,
  startDate: civilDateField,
});

export type EnrollInput = z.infer<typeof enrollSchema>;
export type EnrollField = keyof EnrollInput;

export type EnrollFormState = {
  errors?: Partial<Record<EnrollField, string>>;
  formError?: string;
};

export function toEnrollFieldErrors(error: z.ZodError): EnrollFormState["errors"] {
  return genericToFieldErrors<EnrollField>(error);
}

/** Baja de inscripción (RN9): solo la fecha; el resto lo decide el servicio. */
export const endEnrollmentSchema = z.object({
  enrollmentId: z.string().min(1),
  endDate: civilDateField,
});

/** Ajuste manual del monto (RN2). */
export const chargeAmountSchema = z.object({
  chargeId: z.string().min(1),
  amount: priceField,
});

export type ChargeAmountFormState = {
  errors?: { amount?: string };
  formError?: string;
};
