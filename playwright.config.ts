import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke E2E (Plan §9): corre contra un BUILD DE PRODUCCIÓN local (`next build` + `next start`),
 * nunca contra producción, y contra la misma base efímera de Postgres que usa Vitest
 * (docker-compose.test.yml en local; el service del job en CI).
 *
 * De .env.test salen DATABASE_URL / DIRECT_URL: apuntan al Postgres descartable. Como
 * `next start` NO pisa las variables que ya están en el entorno (@next/env), lo que le
 * pasamos por `webServer.env` gana sobre .env.local: imposible que el E2E le hable a Neon.
 */
loadEnv({ path: ".env.test", quiet: true });

// Puerto propio: así el E2E no se pelea con un `npm run dev` abierto en el 3000.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // El smoke escribe en la base compartida: nada de paralelismo entre archivos.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  // Mobile-first: un teléfono real, no un desktop angosto. Pixel 5 = Chromium + viewport
  // de 393×851 con touch. Un solo browser: el smoke verifica el flujo, no el cross-browser.
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 5"] } }],

  webServer: {
    // Build de producción, no `next dev`: es lo que se despliega.
    command: `npx next start --port ${PORT}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // La app habla con el Postgres de test (con el schema ya aplicado: ver el workflow).
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      DIRECT_URL: process.env.TEST_DATABASE_URL!,
      // Better Auth: sin secret, en un build de producción tira "You are using the default
      // secret" y muere toda la autenticación. No es un secreto de verdad: es una base
      // descartable que vive lo que dura el job.
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? "e2e-only-not-a-secret-0123456789abcdefghijkl",
      // Tiene que coincidir con el origen que sirve la app o Better Auth responde
      // INVALID_ORIGIN. Además, al ser http:// las cookies NO salen con el prefijo
      // __Secure- (que el browser descartaría sobre http).
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
    },
  },
});
