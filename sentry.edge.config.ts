import * as Sentry from "@sentry/nextjs";

/**
 * Sentry del runtime Edge. Hoy Ritma no tiene rutas Edge (el Proxy de Next 16 corre en
 * Node), así que en la práctica no se carga nunca — pero deja `register()` completo si
 * algún día aparece una.
 */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1,
    sendDefaultPii: false,
  });
}
