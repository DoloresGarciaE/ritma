"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { requireRole } from "@/server/authz";
import { ForbiddenError } from "@/server/services/permissions";
import { updateBillingSettings } from "@/server/services/reminders";

import {
  billingSettingsSchema,
  toBillingSettingsFieldErrors,
  type BillingSettingsFormState,
} from "./schema";

/**
 * Ajustes de cobranzas (S5). Como toda server action, revalida la membresía por su
 * cuenta — el layout de `(app)` no la protege — y acá además el ROL: configurar la org
 * es de owner/admin (Plan §4); a un teacher la UI ni le muestra el formulario (§4.3),
 * pero la UI nunca es el único guardián.
 */
export async function updateBillingSettingsAction(
  input: unknown,
): Promise<BillingSettingsFormState> {
  const session = await requireSession();
  if (!session.activeOrgId) throw new ForbiddenError("La sesión no tiene organización activa.");
  const actor = await requireRole(session.activeOrgId, "OWNER", "ADMIN");

  const parsed = billingSettingsSchema.safeParse(input);
  if (!parsed.success) return { errors: toBillingSettingsFieldErrors(parsed.error) };

  // Vacío = null: "sin alias" / "usar la plantilla default de Marca §4.2".
  await updateBillingSettings(actor.orgId, {
    paymentAlias: parsed.data.paymentAlias || null,
    reminderTemplate: parsed.data.reminderTemplate || null,
  });

  revalidatePath("/ajustes");
  // Los recordatorios se arman con estos datos en Deudores y en CADA ficha: el layout
  // de /alumnos revalida también las hijas dinámicas (/alumnos/[id]).
  revalidatePath("/cobranzas");
  revalidatePath("/alumnos", "layout");
  return {};
}
