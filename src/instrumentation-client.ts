import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidad del cliente (F0.7).
 *
 * Bajo Turbopack —que Next 16 usa por defecto— `sentry.client.config.ts` YA NO FUNCIONA:
 * el SDK solo inyecta en `instrumentation-client.*` e `instrumentation.*`. Este es el
 * archivo correcto.
 *
 * El DSN del cliente tiene que ser `NEXT_PUBLIC_*` porque se inlinea en el bundle en tiempo
 * de BUILD: no se puede cambiar en runtime. Sin DSN no se inicializa nada.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? 0.1 : 1,
    // Datos de alumnos y cobranzas: no mandamos PII a un tercero salvo decisión explícita.
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
