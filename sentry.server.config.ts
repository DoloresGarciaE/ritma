import * as Sentry from "@sentry/nextjs";

/**
 * Sentry del servidor. Lo carga `src/instrumentation.ts` en el runtime de Node.
 * Sin DSN no se inicializa: en desarrollo local, cero ruido.
 */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1,
    // Datos de alumnos y cobranzas: no mandamos PII a un tercero salvo decisión explícita.
    sendDefaultPii: false,
  });
}
