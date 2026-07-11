import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Cliente Prisma de la app. Usa la conexión POOLED de Neon (el host termina en
 * "-pooler"); el CLI de Prisma va por la directa (ver prisma.config.ts).
 *
 * Ojo: acá no hay scoping por organización. El helper `withOrg` llega en F0.6 y,
 * a partir de ahí, toda query de negocio pasa por él (Plan §10).
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta DATABASE_URL. Copiá .env.example a .env.local y completala.");
}

const createPrismaClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// En dev, Next recarga los módulos en cada cambio: sin este cache se abriría un
// pool nuevo por recarga hasta agotar las conexiones de Neon.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
