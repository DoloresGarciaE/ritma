import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// src/lib/db.ts lee process.env.DATABASE_URL EN EL IMPORT y lanza si falta: hay que
// tenerla puesta antes de que Vitest arme el grafo de módulos. Cargamos SOLO .env.test
// (nunca .env.local): así los tests jamás pueden terminar hablándole a Neon.
loadEnv({ path: ".env.test", quiet: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` lanza al importarse en Node; en tests lo neutralizamos (ver el stub).
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup-db.ts"],
    env: {
      // La app apunta a la base de TEST, no a Neon (defensa: aunque el entorno traiga
      // otra DATABASE_URL, acá se pisa con la de test).
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL!,
    },
    // NO NEGOCIABLE: los tests comparten una única base y se limpian con TRUNCATE. Con
    // paralelismo de archivos, un worker le borra la base al otro a mitad de test.
    fileParallelism: false,
  },
});
