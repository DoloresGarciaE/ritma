import { forSystem } from "@/lib/db";
import { civilToDb, dbToCivil, isPeriod, periodOf, todayInTz } from "@/lib/dates";
import { generateCharges } from "@/server/services/billing";

/**
 * Job mensual (RN1): genera las cuotas del período para TODAS las organizaciones.
 *
 * Corre vía Vercel Cron el día 1 a la madrugada argentina (vercel.json) y a mano con
 * `npm run cron:dev -- generate-charges [período]`. Es cross-org: entra por `forSystem()`
 * (la puerta de sistema, ver lib/db.ts) e itera org por org — QUÉ cuotas corresponden lo
 * decide el servicio puro; acá solo se juntan datos y se persiste.
 *
 * Idempotente por diseño (decisión S3): cada cuota se upsertea sobre el unique
 * `(enrollmentId, period)` con `update: {}`. Correrlo N veces deja las mismas filas, y
 * NO pisa una cuota que la profe editó a mano (RN2) — eso también está testeado.
 *
 * Sin `period` explícito, cada org recibe el período de SU "hoy" (RN10: el mes se decide
 * en la zona de la org, no en la del servidor).
 */

export type GenerateChargesSummary = {
  orgs: number;
  /** Cuotas nuevas creadas en esta corrida. */
  created: number;
  /** Cuotas que ya existían (el upsert las dejó como estaban). */
  skipped: number;
};

export async function runGenerateCharges(period?: string): Promise<GenerateChargesSummary> {
  if (period !== undefined && !isPeriod(period)) {
    throw new Error(`runGenerateCharges: período inválido: "${period}" (esperaba "YYYY-MM")`);
  }

  const system = forSystem();

  const orgs = await system.organization.findMany({
    select: { id: true, timezone: true, dueDay: true, currency: true },
  });

  let created = 0;
  let skipped = 0;

  for (const org of orgs) {
    const orgPeriod = period ?? periodOf(todayInTz(org.timezone));

    // Todas las MONTHLY de la org: cuáles están activas en el período lo decide el
    // servicio puro (una sola fuente de verdad para RN1/RN9, la testeada).
    const enrollments = await system.enrollment.findMany({
      where: { orgId: org.id, plan: "MONTHLY" },
      select: { id: true, plan: true, price: true, startDate: true, endDate: true },
    });

    const drafts = generateCharges(
      enrollments.map((e) => ({
        id: e.id,
        plan: e.plan,
        price: e.price,
        startDate: dbToCivil(e.startDate),
        endDate: e.endDate ? dbToCivil(e.endDate) : null,
      })),
      orgPeriod,
      { dueDay: org.dueDay, currency: org.currency },
    );

    // El upsert no cuenta qué rama tomó: se mira qué había ANTES para el resumen. Si otra
    // corrida se cruza en el medio, el unique sigue garantizando una sola fila; a lo sumo
    // el resumen atribuye la creación a la otra corrida.
    const existing = new Set(
      (
        await system.charge.findMany({
          where: { orgId: org.id, period: orgPeriod },
          select: { enrollmentId: true },
        })
      ).map((row) => row.enrollmentId),
    );

    for (const draft of drafts) {
      await system.charge.upsert({
        where: {
          enrollmentId_period: { enrollmentId: draft.enrollmentId, period: draft.period },
        },
        // `update: {}`: si la cuota ya existe —incluso editada a mano— no se toca.
        update: {},
        create: {
          orgId: org.id,
          enrollmentId: draft.enrollmentId,
          period: draft.period,
          amount: draft.amount,
          currency: draft.currency,
          dueDate: civilToDb(draft.dueDate),
        },
        select: { id: true },
      });

      if (existing.has(draft.enrollmentId)) skipped += 1;
      else created += 1;
    }
  }

  return { orgs: orgs.length, created, skipped };
}
