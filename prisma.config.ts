import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 ya no carga archivos .env por su cuenta, y nuestros secretos viven
// en .env.local (Plan §5). El primero que define una variable gana.
loadEnv({ path: [".env.local", ".env"], quiet: true });

// El CLI (migrate, studio, seed) va por la conexión DIRECTA: a través del pooler
// de Neon no se puede hacer DDL.
//
// Ojo: no usar el helper env() de "prisma/config". Lanza si la variable falta, y
// como `prisma generate` corre en postinstall, eso rompería `npm ci` en CI, donde
// no hay credenciales de base. `datasource` es opcional y generate no la necesita.
const directUrl = process.env.DIRECT_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  ...(directUrl ? { datasource: { url: directUrl, shadowDatabaseUrl } } : {}),
});
