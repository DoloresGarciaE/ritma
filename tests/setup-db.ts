import { afterAll, beforeAll, beforeEach } from "vitest";

import { db } from "@/lib/db";

import { markAsTestDatabase, resetDb } from "./db";

/**
 * setupFiles de Vitest: corre en cada archivo de test.
 * Deja el centinela puesto, limpia la base antes de cada test y cierra el pool al final.
 */

beforeAll(async () => {
  await markAsTestDatabase(); // idempotente
});

beforeEach(async () => {
  // Limpio ANTES, no después: si un test explota, el estado queda para inspeccionar.
  await resetDb();
});

afterAll(async () => {
  // Sin esto, Vitest cuelga: el pool de `pg` deja sockets abiertos y el singleton de
  // globalThis los mantiene vivos (NODE_ENV=test ≠ production, src/lib/db.ts). Prisma
  // reconecta solo en la próxima query, así que desconectar por archivo es seguro.
  await db.$disconnect();
});
