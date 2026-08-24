import { isAuthorizedCron } from "@/server/system/cron-auth";
import { runGenerateCharges } from "@/server/system/generate-charges";
import { runGenerateRentals } from "@/server/system/generate-rentals";

/**
 * Cron mensual (RN1 + RN7): Vercel lo invoca el día 1 a la madrugada argentina
 * (vercel.json) con `Authorization: Bearer ${CRON_SECRET}`. Genera las cuotas de alumnos
 * Y los cargos de alquiler de externos (S10) en la misma pasada — los dos idempotentes
 * por unique: (enrollmentId, period) y (teacherId, period).
 *
 * El período no se recibe por query: cada org genera el de SU "hoy" (RN10). Para generar
 * un período puntual está `npm run cron:dev -- generate-charges <YYYY-MM>` o
 * `-- generate-rentals <YYYY-MM>`, contra la base que tengas en .env.local.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response(null, { status: 401 });
  }

  const charges = await runGenerateCharges();
  const rentals = await runGenerateRentals();
  return Response.json({ ...charges, rentals });
}
