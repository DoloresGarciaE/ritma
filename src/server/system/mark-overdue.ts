import { forSystem } from "@/lib/db";
import { dbToCivil, todayInTz } from "@/lib/dates";
import { markOverdue } from "@/server/services/billing";

/**
 * Job diario (RN3, HU4.5): pasa a OVERDUE toda cuota PENDING/PARTIAL cuyo vencimiento ya
 * quedó atrás. Corre vía Vercel Cron a la madrugada argentina y a mano con
 * `npm run cron:dev -- mark-overdue`.
 *
 * Cross-org por `forSystem()` (la puerta de sistema), org por org: "hoy" es el de la ZONA
 * DE CADA ORG (RN10), no el del servidor. Las transiciones exactas las decide el servicio
 * puro (`markOverdue`), que está testeado con RN3 al pie de la letra; acá solo se juntan
 * candidatas y se escribe el resultado.
 *
 * Idempotente: una cuota ya OVERDUE no es candidata, así que la corrida de mañana no la
 * vuelve a tocar; PAID y WAIVED ni siquiera se leen.
 */

export type MarkOverdueSummary = {
  orgs: number;
  /** Cuotas que pasaron a OVERDUE en esta corrida. */
  marked: number;
};

export async function runMarkOverdue(): Promise<MarkOverdueSummary> {
  const system = forSystem();

  const orgs = await system.organization.findMany({
    select: { id: true, timezone: true },
  });

  let marked = 0;

  for (const org of orgs) {
    const today = todayInTz(org.timezone);

    const candidates = await system.charge.findMany({
      where: { orgId: org.id, status: { in: ["PENDING", "PARTIAL"] } },
      select: { id: true, status: true, dueDate: true },
    });

    const ids = markOverdue(
      candidates.map((c) => ({ id: c.id, status: c.status, dueDate: dbToCivil(c.dueDate) })),
      today,
    );
    if (ids.length === 0) continue;

    // El where re-chequea el estado: si un pago llegó entre la lectura y esta escritura
    // (S4), la cuota ya no está PENDING/PARTIAL y no se pisa.
    const result = await system.charge.updateMany({
      where: { id: { in: ids }, orgId: org.id, status: { in: ["PENDING", "PARTIAL"] } },
      data: { status: "OVERDUE" },
    });

    marked += result.count;
  }

  return { orgs: orgs.length, marked };
}
