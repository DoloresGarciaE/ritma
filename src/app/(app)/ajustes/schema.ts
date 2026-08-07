import { z } from "zod";

import { toFieldErrors as genericToFieldErrors } from "@/lib/forms";

/**
 * Ajustes de cobranzas (S5): alias de cobro y plantilla de recordatorio. Los dos son
 * opcionales — vacío significa "sin alias" / "usar la plantilla default de Marca §4.2".
 */

export const billingSettingsSchema = z.object({
  paymentAlias: z.string().trim().max(60, "Máximo 60 caracteres."),
  reminderTemplate: z.string().trim().max(600, "Máximo 600 caracteres."),
});

export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;
export type BillingSettingsField = keyof BillingSettingsInput;

export type BillingSettingsFormState = {
  errors?: Partial<Record<BillingSettingsField, string>>;
  formError?: string;
};

export function toBillingSettingsFieldErrors(
  error: z.ZodError,
): BillingSettingsFormState["errors"] {
  return genericToFieldErrors<BillingSettingsField>(error);
}
