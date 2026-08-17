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

/**
 * Inscribir de a varios al MISMO grupo: la tanda comparte plan, precio y fecha de alta
 * (decisión del ticket). Es el mismo schema menos `studentId`, más la lista.
 */
export const bulkEnrollSchema = enrollSchema.omit({ studentId: true }).extend({
  studentIds: z.array(z.string().min(1)).min(1, "Elegí al menos un alumno."),
});

export type BulkEnrollInput = z.infer<typeof bulkEnrollSchema>;

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

/** Un pago (HU4.3): a diferencia de un precio, tiene que ser MAYOR a cero. */
const paymentAmountField = z
  .number({ error: "Poné el monto del pago." })
  .positive("El pago tiene que ser mayor a cero.")
  .max(9_999_999_999, "Ese monto es demasiado alto.");

export const paymentSchema = z.object({
  studentId: z.string().min(1),
  amount: paymentAmountField,
  method: z.enum(["CASH", "TRANSFER", "OTHER"]),
  receivedBy: z.enum(["STUDIO", "TEACHER"]).optional(),
  paidAt: civilDateField,
  /** Ausente → imputación automática (RN4); presente → edición manual (HU4.4). */
  allocations: z
    .array(
      z.object({
        chargeId: z.string().min(1),
        amount: z
          .number({ error: "Poné el monto de la imputación." })
          .positive("Cada imputación tiene que ser mayor a cero."),
      }),
    )
    .optional(),
});

export type PaymentField = "amount" | "paidAt";

export type PaymentFormState = {
  errors?: Partial<Record<PaymentField, string>>;
  formError?: string;
};

export function toPaymentFieldErrors(error: z.ZodError): PaymentFormState["errors"] {
  return genericToFieldErrors<PaymentField>(error);
}
