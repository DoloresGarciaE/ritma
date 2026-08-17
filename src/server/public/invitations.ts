import "server-only";

import { cache } from "react";

import { forPublic } from "@/lib/db";

/**
 * La puerta por token de la invitación (S7): `/invitacion/[token]` se resuelve sin
 * membresía — quien acepta todavía NO es de la org, así que `withOrg` no puede
 * representarlo (el huevo y la gallina). La autorización ES el token, igual que el
 * comprobante (S5): opaco, 192 bits, imposible de adivinar; revocar es borrar la fila.
 *
 * Qué devuelve cada estado (decisión S7 — "sin filtrar información de la org"):
 * - Válida → org y rol: es EXACTAMENTE lo que la página de aceptación muestra.
 * - Usada / vencida → solo el estado, SIN el nombre de la org: un link viejo
 *   reenviado no tiene por qué contar para quién era.
 * - Desconocida o revocada → null → 404 genérico que no confirma nada.
 *
 * El `orgId` del caso válido es para la ACEPTACIÓN (server action), que revalida el
 * token adentro de su transacción vía `withOrg`; la página no lo renderiza.
 */

export type PublicInvitation =
  | { kind: "valid"; orgId: string; orgName: string; role: "ADMIN" | "TEACHER" }
  | { kind: "used" }
  | { kind: "expired" };

export const getInvitationByToken = cache(
  async (token: string): Promise<PublicInvitation | null> => {
    // Un token real mide 32 chars (24 bytes base64url): lo desmedido ni viaja a la base.
    if (!token || token.length > 64) return null;

    const invitation = await forPublic().invitation.findUnique({
      where: { token },
      select: {
        orgId: true,
        role: true,
        expiresAt: true,
        usedAt: true,
        org: { select: { name: true } },
      },
    });
    if (!invitation) return null;

    // Usada le gana a vencida: ya cumplió su propósito, ese es su estado.
    if (invitation.usedAt) return { kind: "used" };
    if (invitation.expiresAt.getTime() < Date.now()) return { kind: "expired" };
    if (invitation.role === "OWNER") return null;

    return {
      kind: "valid",
      orgId: invitation.orgId,
      orgName: invitation.org.name,
      role: invitation.role,
    };
  },
);
