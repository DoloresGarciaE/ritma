import { readFileSync } from "node:fs";

import { parse } from "dotenv";

/**
 * Cinturón anti-producción de `seed:scenarios`: el script se niega a correr — incluso con
 * `--yes` — si `DATABASE_URL` apunta al branch de producción de Neon (ADR-003: un branch
 * por entorno). La referencia es DOBLE: el endpoint de prod fijado acá abajo (funciona en
 * cualquier máquina) más lo que diga el `.env.production` local si existe.
 */

/**
 * El endpoint de PRODUCCIÓN de Neon, fijado en el código (ticket ambientes DEV/PROD).
 * Es solo el label del host — sin credenciales no abre nada — y que el cinturón funcione
 * en CUALQUIER máquina vale más que no publicar un label. Si la base de prod cambia de
 * endpoint, se actualiza ACÁ y en el test.
 */
export const PRODUCTION_ENDPOINT_IDS: readonly string[] = ["ep-round-dawn-at0ylkcp"];

/**
 * El id de endpoint de Neon es el primer label del hostname, sin el sufijo `-pooler`:
 * `ep-x-pooler.c-9.aws.neon.tech` y `ep-x.c-9.aws.neon.tech` son la MISMA base.
 * Para hosts no-Neon degrada a comparar el primer label, que es conservador (solo puede
 * prohibir de más, nunca de menos).
 */
export function endpointId(hostname: string): string {
  const label = hostname.toLowerCase().split(".")[0] ?? "";
  return label.endsWith("-pooler") ? label.slice(0, -"-pooler".length) : label;
}

/**
 * ¿`databaseUrl` apunta a producción? Compara contra los endpoints fijados en el código
 * Y contra `productionUrls` (lo leído de `.env.production`, si existe).
 */
export function isProductionTarget(
  databaseUrl: string,
  productionUrls: readonly string[],
): boolean {
  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    return false; // una URL rota no llega a escribir nada: la corta el `new URL` del seed
  }
  const targetId = endpointId(target.hostname);
  if (!targetId) return false;

  if (PRODUCTION_ENDPOINT_IDS.includes(targetId)) return true;

  return productionUrls.some((raw) => {
    try {
      return endpointId(new URL(raw).hostname) === targetId;
    } catch {
      return false;
    }
  });
}

/** Lee DATABASE_URL/DIRECT_URL de un env file SIN tocar process.env. `[]` si no existe. */
export function productionDbUrls(envFilePath: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(envFilePath, "utf8");
  } catch {
    return [];
  }
  const parsed = parse(raw);
  return [parsed.DATABASE_URL, parsed.DIRECT_URL].filter((u): u is string => Boolean(u));
}
