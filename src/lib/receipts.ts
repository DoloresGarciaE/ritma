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
