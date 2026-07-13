import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidad del servidor (F0.7).
 *
 * Sentry se inicializa SOLO si hay DSN (ver sentry.server.config.ts). En desarrollo local,
 * sin DSN, esto es un no-op silencioso: cero ruido.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Captura los errores de Server Components, Route Handlers, Server Actions y el Proxy.
 * Sin DSN, el cliente de Sentry nunca se inicializó y esto no hace nada.
 */
export const onRequestError: Instrumentation.onRequestError = Sentry.captureRequestError;
