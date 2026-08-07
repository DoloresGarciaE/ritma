import { randomBytes } from "node:crypto";

/**
 * Tokens de comprobante (S4 genera, S5 consume).
 *
 * Opaco y criptográficamente aleatorio: 24 bytes (192 bits) en base64url — imposible de
 * adivinar o iterar, sin información adentro (ni ids ni fechas: la página pública de S5
 * resuelve todo por lookup). Único por el `@unique` de la base; la probabilidad de
 * colisión es despreciable y, si ocurriera, el unique la corta.
 */
export function generateReceiptToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * URL ABSOLUTA del comprobante público: lo que se comparte por WhatsApp tiene que abrir
 * desde cualquier teléfono, así que la base sale de `NEXT_PUBLIC_APP_URL` (F0.1), nunca
 * de un path relativo. Sin la env (no debería pasar: está desde el día 1), localhost —
 * visible al instante en vez de un link roto en silencio.
 */
export function receiptUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/r/${token}`;
}
