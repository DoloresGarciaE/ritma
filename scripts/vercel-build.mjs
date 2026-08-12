import { execSync } from "node:child_process";

/**
 * El build de Vercel con el gate de migraciones (ticket ambientes DEV/PROD, ADR-003):
 *
 * - Producción (rama `main`, VERCEL_ENV=production) → migra su base (Neon prod).
 * - DEV (deploys de la rama `dev`, que salen como VERCEL_ENV=preview) → migra la base
 *   dev: una migración se ESTRENA en DEV al mergear.
 * - Previews de PR → NO migran: comparten la base dev y una rama no le cambia el schema
 *   a todo el mundo antes de estar mergeada.
 *
 * Fuera de Vercel (VERCEL_ENV vacío) no migra: el build local jamás toca una base (F0.7).
 */

const env = process.env.VERCEL_ENV ?? "";
const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "";

const isProduction = env === "production";
const isDevDeploy = env === "preview" && ref === "dev";
const shouldMigrate = isProduction || isDevDeploy;

const run = (cmd) => {
  console.log(`\n[vercel-build] ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

console.log(
  `[vercel-build] VERCEL_ENV=${env || "(vacío)"} · rama=${ref || "(sin rama)"} · ` +
    (shouldMigrate
      ? `migra (${isProduction ? "producción" : "DEV: rama dev sobre la base dev"})`
      : "NO migra (preview de PR o build local)"),
);

run("prisma generate");
if (shouldMigrate) run("prisma migrate deploy");
run("next build");
