import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Seed idempotente: se puede correr todas las veces que haga falta sin duplicar
 * nada. Siembra las dos organizaciones de los casos de uso del Plan (§2, §3):
 * una profe independiente y un estudio con varios profes.
 *
 * No usa el singleton de src/lib/db.ts a propósito: ese apunta a la conexión
 * pooled y nunca hace $disconnect(), así que dejaría el proceso colgado.
 */

// `prisma db seed` ya hereda las variables que cargó prisma.config.ts, pero esto
// permite correr `tsx prisma/seed.ts` a mano.
loadEnv({ path: [".env.local", ".env"], quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta DIRECT_URL (o DATABASE_URL) para correr el seed.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Ids estables: son la clave de la idempotencia del upsert de organizaciones,
// que no tiene ningún otro campo único.
const ORG_INDEPENDIENTE = "seed_org_independiente";
const ORG_ESTUDIO = "seed_org_estudio";

async function main() {
  // Caso 1 — profe independiente: trabaja sola, es dueña y docente de su org.
  const malena = await prisma.user.upsert({
    where: { email: "malena@example.com" },
    update: { name: "Malena Ríos" },
    create: { email: "malena@example.com", name: "Malena Ríos" },
  });

  const danzasMalena = await prisma.organization.upsert({
    where: { id: ORG_INDEPENDIENTE },
    update: { name: "Danzas Malena" },
    create: {
      id: ORG_INDEPENDIENTE,
      name: "Danzas Malena",
      type: "INDEPENDENT",
      // currency, timezone y dueDay quedan en los defaults del schema (ARS,
      // America/Argentina/Buenos_Aires, 10) — son los defaults de HU1.2.
    },
  });

  // Caso 2 — estudio: la dueña administra, y más adelante suma profes staff y externos.
  const carla = await prisma.user.upsert({
    where: { email: "carla@example.com" },
    update: { name: "Carla Duarte" },
    create: { email: "carla@example.com", name: "Carla Duarte" },
  });

  const estudioCompas = await prisma.organization.upsert({
    where: { id: ORG_ESTUDIO },
    update: { name: "Estudio Compás" },
    create: {
      id: ORG_ESTUDIO,
      name: "Estudio Compás",
      type: "STUDIO",
    },
  });

  for (const { userId, orgId } of [
    { userId: malena.id, orgId: danzasMalena.id },
    { userId: carla.id, orgId: estudioCompas.id },
  ]) {
    await prisma.membership.upsert({
      where: { userId_orgId: { userId, orgId } },
      update: { role: "OWNER" },
      create: { userId, orgId, role: "OWNER" },
    });
  }

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    include: { memberships: { include: { user: true } } },
  });

  console.log("\nOrganizaciones sembradas:\n");
  console.table(
    orgs.flatMap((org) =>
      org.memberships.map((m) => ({
        org: org.name,
        tipo: org.type,
        moneda: org.currency,
        vencimiento: org.dueDay,
        usuario: m.user.name,
        email: m.user.email,
        rol: m.role,
      })),
    ),
  );
  console.log(
    `Totales — organizaciones: ${await prisma.organization.count()} · ` +
      `usuarios: ${await prisma.user.count()} · ` +
      `membresías: ${await prisma.membership.count()}\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
