import { z } from "zod";

import { isCivilDate } from "@/lib/dates";
import { toFieldErrors as genericToFieldErrors } from "@/lib/forms";
import { scheduleCollisionError } from "@/lib/franjas";

/**
 * Validación de la agenda, compartida por formularios y server actions (patrón de
 * alumnos/schema.ts): el mismo schema valida antes de enviar y al recibir.
 */

export const MAX_GROUP_NAME_LENGTH = 80;
export const MIN_DURATION_MIN = 15;
export const MAX_DURATION_MIN = 480;

/** "HH:mm" de 24 horas — el mismo formato de `ScheduleSlot.startTime` (RN10). */
const timeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Poné una hora válida (por ejemplo 19:00).");

const civilDateField = z.string().refine(isCivilDate, "Esa fecha no es válida.");

/**
 * Franja multi-día (ticket horarios): {días, hora, duración} — concepto de UI que la
 * action EXPANDE a un ScheduleSlot por día (src/lib/franjas.ts). El modelo no cambia.
 */
export const franjaSchema = z.object({
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6, "Elegí el día."),
        /** Presente = ese día ya existe como slot (el diff del servicio lo reconoce). */
        slotId: z.string().optional(),
      }),
    )
    .min(1, "Elegí al menos un día."),
  startTime: timeField,
  durationMin: z
    .number({ error: "Poné la duración en minutos." })
    .int("Poné la duración en minutos enteros.")
    .min(MIN_DURATION_MIN, `Entre ${MIN_DURATION_MIN} minutos y 8 horas.`)
    .max(MAX_DURATION_MIN, `Entre ${MIN_DURATION_MIN} minutos y 8 horas.`),
});

export const groupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Poné el nombre del grupo.")
    .max(
      MAX_GROUP_NAME_LENGTH,
      `El nombre no puede tener más de ${MAX_GROUP_NAME_LENGTH} caracteres.`,
    ),
  disciplineId: z.string().min(1, "Elegí una disciplina."),
  defaultPrice: z
    .number({ error: "Poné la tarifa de referencia." })
    .min(0, "La tarifa no puede ser negativa.")
    // Decimal(12,2): sin tope, un número gigante desborda en Prisma y revienta la action
    // en vez de dar error de campo.
    .max(9_999_999_999, "Esa tarifa es demasiado alta."),
  franjas: z
    .array(franjaSchema)
    .min(1, "Agregá al menos una franja.")
    // Colisión interna (mismo día + misma hora en dos franjas): el error NOMBRA el
    // conflicto — "Lunes 19:00 está repetido." — antes de guardar.
    .superRefine((franjas, ctx) => {
      const message = scheduleCollisionError(franjas);
      if (message) ctx.addIssue({ code: "custom", message });
    }),
});

export type GroupFormInput = z.infer<typeof groupSchema>;
export type GroupField = keyof GroupFormInput;

export type GroupFormState = {
  errors?: Partial<Record<GroupField, string>>;
  formError?: string;
};

export function toGroupFieldErrors(error: z.ZodError): GroupFormState["errors"] {
  return genericToFieldErrors<GroupField>(error);
}

/** Identifica una ocurrencia: la franja + su fecha civil ORIGINAL (HU3.3). */
export const occurrenceRefSchema = z.object({
  slotId: z.string().min(1),
  date: civilDateField,
});

export const rescheduleSchema = occurrenceRefSchema.extend({
  movedToDate: civilDateField,
  movedToStartTime: timeField,
});

export type RescheduleField = "movedToDate" | "movedToStartTime";

export type RescheduleFormState = {
  errors?: Partial<Record<RescheduleField, string>>;
  formError?: string;
};

export function toRescheduleFieldErrors(error: z.ZodError): RescheduleFormState["errors"] {
  return genericToFieldErrors<RescheduleField>(error);
}
