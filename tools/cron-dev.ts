import { config as loadEnv } from "dotenv";

/**
 * Dispara un job de sistema A MANO contra la base de tu .env.local (dev), sin pasar por
 * el endpoint HTTP ni por CRON_SECRET:
 *
 *   npm run cron:dev -- generate-charges           # el período de "hoy" de cada org
 *   npm run cron:dev -- generate-charges 2026-08   # un período puntual
 *   npm run cron:dev -- mark-overdue
 *
 * Es la herramienta del DoD de S3 ("simular el cambio de mes"): generá el período que
 * quieras y mirá la pantalla de Cobranzas. Mismo patrón que prisma/seed.ts: dotenv
 * primero, imports dinámicos después (db.ts lee process.env al importarse).
 */

loadEnv({ path: [".env.local", ".env"], quiet: true });

const [job, period] = process.argv.slice(2);

async function main() {
  const { db } = await import("../src/lib/db");

  try {
    switch (job) {
      case "generate-charges": {
        const { runGenerateCharges } = await import("../src/server/system/generate-charges");
        const summary = await runGenerateCharges(period);
        console.log(
          `generate-charges${period ? ` (${period})` : ""} — orgs: ${summary.orgs} · ` +
            `creadas: ${summary.created} · ya existían: ${summary.skipped}`,
        );
        break;
      }
      case "mark-overdue": {
        const { runMarkOverdue } = await import("../src/server/system/mark-overdue");
        const summary = await runMarkOverdue();
        console.log(`mark-overdue — orgs: ${summary.orgs} · marcadas vencidas: ${summary.marked}`);
        break;
      }
      default:
        console.error(
          `Uso: npm run cron:dev -- <generate-charges [YYYY-MM] | mark-overdue>` +
            (job ? `\nJob desconocido: "${job}"` : ""),
        );
        process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
