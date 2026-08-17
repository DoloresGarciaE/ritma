import { randomBytes } from "node:crypto";

/**
 * El token de una invitación al equipo (S7): opaco y criptográficamente aleatorio,
 * el MISMO patrón que el comprobante (S5). 24 bytes = 192 bits — inadivinable por
 * fuerza bruta. La autorización ES el token: revocar una invitación es borrar su
 * fila, y regenerarla es rotar el token (el link viejo muere en el acto).
 */
export function generateInvitationToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Cuánto vive una invitación (HU1.3, decisión S7): 7 días desde que se crea. */
export const INVITATION_TTL_DAYS = 7;

/**
 * La URL para compartir. El origen se hornea en el build (`NEXT_PUBLIC_APP_URL`),
 * igual que el link del comprobante.
 */
export function invitationUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/invitacion/${token}`;
}
