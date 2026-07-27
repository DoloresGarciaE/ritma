import { isAuthorizedCron } from "@/server/system/cron-auth";
import { runGenerateCharges } from "@/server/system/generate-charges";

/**
 * Cron mensual (RN1): Vercel lo invoca el día 1 a la madrugada argentina (vercel.json)
 * con `Authorization: Bearer ${CRON_SECRET}`. Idempotente: re-invocarlo (retry de Vercel,
 * curl a mano) no duplica cuotas — la garantía es el unique (enrollmentId, period).
 *
 * El período no se recibe por query: cada org genera el de SU "hoy" (RN10). Para generar
 * un período puntual está `npm run cron:dev -- generate-charges <YYYY-MM>`, contra la
 * base que tengas en .env.local.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response(null, { status: 401 });
  }

  const summary = await runGenerateCharges();
  return Response.json(summary);
}
