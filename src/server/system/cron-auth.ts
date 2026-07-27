import { timingSafeEqual } from "node:crypto";

/**
 * La guardia de los endpoints de cron (S3): Vercel Cron manda
 * `Authorization: Bearer ${CRON_SECRET}` en cada invocación; cualquier otro caller tiene
 * que conocer el secreto. Sin `CRON_SECRET` configurado NO hay acceso (fail-closed): un
 * endpoint que genera deuda no puede quedar abierto por una variable olvidada.
 *
 * La comparación es en tiempo constante (`timingSafeEqual`): un `===` de strings corta en
 * el primer byte distinto y filtra por timing cuántos caracteres acertaste.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // timingSafeEqual exige buffers del mismo largo; el largo del secreto no es el dato
  // que protegemos (el header del atacante lo elige él).
  return a.length === b.length && timingSafeEqual(a, b);
}
