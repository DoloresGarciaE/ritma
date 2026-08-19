import { z } from "zod";

/**
 * La invitación al equipo (S7, HU1.3): rol obligatorio (ADMIN o TEACHER — OWNER no se
 * invita) y email OPCIONAL: el link copiable existe siempre; el email es solo un canal
 * más. Compartido entre el sheet (cliente) y la action (server): una sola validación.
 */
export const inviteSchema = z.object({
  role: z.enum(["ADMIN", "TEACHER"], { message: "Elegí el rol." }),
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
});

export type InviteInput = z.input<typeof inviteSchema>;
