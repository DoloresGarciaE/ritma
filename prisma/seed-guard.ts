import { readFileSync } from "node:fs";

import { parse } from "dotenv";

/**
 * Cinturón anti-producción de `seed:scenarios`: el script se niega a correr — incluso con
 * `--yes` — si `DATABASE_URL` apunta al branch de producción de Neon (F0.7: un branch por
 * entorno). La referencia de "qué es producción" es el `.env.production` LOCAL (gitignored):
 * el repo es público y el host de prod no se commitea. Sin ese archivo no hay contra qué
 * comparar y el cinturón lo dice en voz alta.
 */

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

/** ¿`databaseUrl` apunta a alguna de las bases de `productionUrls`? */
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
