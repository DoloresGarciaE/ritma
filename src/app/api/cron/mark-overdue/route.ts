import { isAuthorizedCron } from "@/server/system/cron-auth";
import { runMarkOverdue } from "@/server/system/mark-overdue";

/**
 * Cron diario (RN3, HU4.5): Vercel lo invoca cada madrugada argentina (vercel.json) con
 * `Authorization: Bearer ${CRON_SECRET}`. Idempotente: una cuota ya OVERDUE no vuelve a
 * ser candidata, y PAID/WAIVED jamás se tocan.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response(null, { status: 401 });
  }

  const summary = await runMarkOverdue();
  return Response.json(summary);
}
