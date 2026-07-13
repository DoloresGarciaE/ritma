import { db } from "@/lib/db";

/**
 * La guarda contra truncar la base equivocada. El harness hace TRUNCATE de todas las
 * tablas entre tests; si `TEST_DATABASE_URL` apuntara por accidente a la base de dev o de
 * producción, sería pérdida de datos. Cuatro capas, y las dos últimas hacen que sea
 * IMPOSIBLE (no "improbable") borrar la base que no es:
 *
 *  1. NODE_ENV nunca puede ser production.
 *  2. Chequeos estáticos sobre la URL: host local y base con sufijo `_test`. Se prohíben
 *     los hosts remotos (Neon incluido): sus URLs son indistinguibles de las de prod.
 *  3. Chequeo contra la CONEXIÓN VIVA, no contra el string: `current_database()`. Un
 *     string puede mentir (un pooler, PGHOST); la conexión no.
 *  4. CENTINELA: la tabla `_ritma_test_marker`. La crea SOLO este harness, y solo después
 *     de pasar (1)–(3). Ninguna base de dev ni de prod la tiene, y no la crea ninguna
 *     migración. Sin centinela, `resetDb()` se niega a truncar. Así, aunque alguien
 *     apuntara la URL a producción y burlara los chequeos de string, el TRUNCATE no corre.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
//                                                        └── hostname del service en GitHub Actions

let verified = false;

async function assertIsTestDatabase(): Promise<void> {
  if (verified) return;

  if (process.env.NODE_ENV === "production") {
    throw new Error("[test-db] NODE_ENV=production. Abortando: el harness trunca tablas.");
  }

  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    throw new Error(
      "[test-db] Falta TEST_DATABASE_URL. Corré `npm run test:db:up` y revisá .env.test.",
    );
  }

  const url = new URL(raw);
  const host = url.hostname;
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `[test-db] Host "${host}" no es local. La base de test tiene que ser un Postgres ` +
        `efímero (docker-compose.test.yml) o el service de CI. Nunca Neon: sus URLs son ` +
        `indistinguibles de las de producción.`,
    );
  }
  if (!name.endsWith("_test")) {
    throw new Error(`[test-db] La base "${name}" no termina en "_test". Abortando el TRUNCATE.`);
  }

  // La app tiene que estar hablando con ESTA base, no con otra (vitest.config.ts pisa
  // DATABASE_URL con TEST_DATABASE_URL; si alguien lo desarma, saltamos acá).
  if (process.env.DATABASE_URL !== raw) {
    throw new Error("[test-db] DATABASE_URL != TEST_DATABASE_URL: el cliente apunta a otra base.");
  }

  // Capas 3 y 4: contra la conexión real.
  const [live] = await db.$queryRaw<{ name: string; marker: boolean }[]>`
    SELECT current_database() AS name,
           to_regclass('"_ritma_test_marker"') IS NOT NULL AS marker
  `;

  if (!live.name.endsWith("_test")) {
    throw new Error(
      `[test-db] La conexión viva está en "${live.name}", que no termina en "_test".`,
    );
  }
  if (!live.marker) {
    throw new Error(
      `[test-db] "${live.name}" no tiene la tabla centinela _ritma_test_marker: NO es una base ` +
        `de test de Ritma. Corré \`npm run test:db:up && npm run test:db:setup\`.`,
    );
  }

  verified = true;
}

/** Crea el centinela. Solo lo llama el setup, y solo tras pasar las capas 1–3. */
export async function markAsTestDatabase(): Promise<void> {
  const raw = process.env.TEST_DATABASE_URL ?? "";
  const url = new URL(raw);
  if (!LOCAL_HOSTS.has(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error(`[test-db] Me niego a marcar "${raw}" como base de test.`);
  }
  await db.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "_ritma_test_marker" (ok boolean PRIMARY KEY DEFAULT true)`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "_ritma_test_marker" VALUES (true) ON CONFLICT DO NOTHING`,
  );
}

/**
 * Limpia la base entre tests. Un solo TRUNCATE con CASCADE, así el orden de las FKs no
 * importa. Las tablas salen de `pg_tables` (el catálogo real de Postgres): toma sola
 * cualquier modelo futuro y ve las tablas de Better Auth. El prefijo "_" excluye
 * `_prisma_migrations` y el centinela. Los nombres son PascalCase → van entre comillas.
 */
export async function resetDb(): Promise<void> {
  await assertIsTestDatabase();

  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = current_schema()
       AND left(tablename, 1) <> '_'
  `;
  if (tables.length === 0) return;

  const list = tables.map((t) => `"${t.tablename.replace(/"/g, '""')}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
