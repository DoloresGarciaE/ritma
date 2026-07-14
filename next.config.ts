import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {/* config options here */};

/**
 * Sentry existe solo si hay DSN (F0.7). Sin DSN —o sea, en desarrollo local— se exporta el
 * config pelado: no se instala el plugin, no se inyectan reglas de Turbopack y no se generan
 * sourcemaps. Cero ruido y cero costo.
 *
 * Ojo: el gate es en tiempo de BUILD. `NEXT_PUBLIC_SENTRY_DSN` tiene que estar en el entorno
 * de build de Vercel, no solo en el de runtime, o el plugin no se instala nunca.
 */
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

/**
 * Subir sourcemaps es opcional. Si no hay token hay que APAGARLAS explícitamente: bajo
 * Turbopack el SDK prende `productionBrowserSourceMaps` por su cuenta y después avisa que no
 * puede subir nada. Sin token el build igual pasa (el plugin avisa y sigue, no lanza).
 */
const UPLOAD_SOURCEMAPS = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { disable: !UPLOAD_SOURCEMAPS },
      silent: !process.env.CI,
      telemetry: false,
      bundleSizeOptimizations: { excludeDebugStatements: true },
    })
  : nextConfig;
