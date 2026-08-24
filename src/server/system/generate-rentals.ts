import { forSystem } from "@/lib/db";
import {
  addMonths,
  civilToDb,
  dateInPeriod,
  dbToCivil,
  isPeriod,
  periodOf,
  todayInTz,
} from "@/lib/dates";
import {
  computeRentalCharge,
  type RentalOccurrence,
  type RentalPeriodValue,
  type RentalSlice,
} from "@/server/services/rentals";
import {
  occurrencesForRange,
  type SessionException,
  type SlotInfo,
} from "@/server/services/schedule";

/**
 * Job mensual de alquileres (S10, RN7): genera los cargos de los profes EXTERNAL de
 * cada estudio. Corre en el MISMO cron del día 1 que las cuotas (vercel.json) y a mano
 * con `npm run cron:dev -- generate-rentals [período]` (el período es el "que arranca").
 *
 * Qué genera cada corrida (decisión S10):
 * - MONTHLY → el cargo fijo del período que ARRANCA (como las cuotas RN1). Nada
 *   retroactivo: un acuerdo mensual nacido a mitad de mes cobra desde su primer día 1
 *   (mismo espíritu que el alta retroactiva de S3).
 * - PER_SESSION / PER_HOUR → el cargo del período que acaba de CERRAR, contando las
 *   ocurrencias reales (`occurrencesForRange`, cero motor nuevo) NO canceladas (RN8),
 *   por su fecha MOSTRADA. Cargo cero no se genera.
 * El modo lo decide el acuerdo vigente al ÚLTIMO día del período del cargo; el job solo
 * elige QUÉ período pedirle al motor según ese modo.
 *
 * `dueDate` = día `dueDay` de la org en el MES DE GENERACIÓN: un cargo por sesiones de
 * julio, generado el 1 de agosto, vence en agosto — no nace vencido.
 *
 * Idempotente (patrón S3): upsert sobre el unique (teacherId, period) con `update: {}` —
 * re-correrlo no duplica ni pisa un monto editado a mano.
 */

export type GenerateRentalsSummary = {
  orgs: number;
  /** Cargos nuevos creados en esta corrida. */
  created: number;
  /** Cargos que ya existían (el upsert los dejó como estaban). */
  skipped: number;
};

export async function runGenerateRentals(period?: string): Promise<GenerateRentalsSummary> {
  if (period !== undefined && !isPeriod(period)) {
    throw new Error(`runGenerateRentals: período inválido: "${period}" (esperaba "YYYY-MM")`);
  }

  const system = forSystem();

  // Solo estudios: los EXTERNAL no existen en una INDEPENDENT (regla S7/S10).
  const orgs = await system.organization.findMany({
    where: { type: "STUDIO" },
    select: { id: true, timezone: true, dueDay: true, currency: true },
  });

  let created = 0;
  let skipped = 0;

  for (const org of orgs) {
    const startingPeriod = period ?? periodOf(todayInTz(org.timezone));
    const closedPeriod = addMonths(startingPeriod, -1);

    const externals = await system.teacherProfile.findMany({
      where: { orgId: org.id, kind: "EXTERNAL" },
      select: {
        id: true,
        agreements: {
          where: { type: "RENTAL", rentalAmount: { not: null }, rentalPeriod: { not: null } },
          orderBy: { validFrom: "asc" },
          select: { validFrom: true, rentalAmount: true, rentalPeriod: true },
        },
      },
    });
    if (externals.length === 0) continue;

    // Las ocurrencias del período CERRADO, de los grupos activos de los externos. Las
    // excepciones van completas de la org: el motor ignora las de slots ausentes.
    const from = dateInPeriod(closedPeriod, 1);
    const to = dateInPeriod(closedPeriod, 31);
    const [groups, exceptionRows] = await Promise.all([
      system.classGroup.findMany({
        where: {
          orgId: org.id,
          active: true,
          teacherId: { in: externals.map((external) => external.id) },
        },
        select: {
          id: true,
          teacherId: true,
          spaceId: true,
          slots: { select: { id: true, weekday: true, startTime: true, durationMin: true } },
        },
      }),
      system.classSession.findMany({
        where: {
          orgId: org.id,
          OR: [
            { date: { gte: civilToDb(from), lte: civilToDb(to) } },
            { movedToDate: { gte: civilToDb(from), lte: civilToDb(to) } },
          ],
        },
        select: {
          slotId: true,
          date: true,
          status: true,
          note: true,
          movedToDate: true,
          movedToStartTime: true,
        },
      }),
    ]);

    const slots: SlotInfo[] = groups.flatMap((group) =>
      group.slots.map((slot) => ({ ...slot, groupId: group.id })),
    );
    const exceptions: SessionException[] = exceptionRows.map((row) => ({
      slotId: row.slotId,
      date: dbToCivil(row.date),
      status: row.status,
      note: row.note,
      movedToDate: row.movedToDate ? dbToCivil(row.movedToDate) : null,
      movedToStartTime: row.movedToStartTime,
    }));
    const groupById = new Map(groups.map((group) => [group.id, group]));

    const closedOccurrences = occurrencesForRange(slots, exceptions, { from, to });
    const byTeacher = new Map<string, RentalOccurrence[]>();
    for (const occurrence of closedOccurrences) {
      const group = groupById.get(occurrence.groupId)!;
      const teacherId = group.teacherId!;
      const list = byTeacher.get(teacherId) ?? [];
      list.push({
        date: occurrence.date,
        durationMin: occurrence.durationMin,
        cancelled: occurrence.status === "CANCELLED",
        hasSpace: group.spaceId !== null,
      });
      byTeacher.set(teacherId, list);
    }

    // El vencimiento de TODO lo generado hoy: día dueDay del mes de generación.
    const dueDate = civilToDb(dateInPeriod(startingPeriod, org.dueDay));

    for (const external of externals) {
      const slices: RentalSlice[] = external.agreements.map((agreement) => ({
        validFrom: dbToCivil(agreement.validFrom),
        rentalAmount: agreement.rentalAmount!,
        rentalPeriod: agreement.rentalPeriod as RentalPeriodValue,
      }));
      if (slices.length === 0) continue;

      const drafts = [
        // El período que arranca: SOLO si el acuerdo vigente es mensual.
        { draft: computeRentalCharge(slices, [], startingPeriod), keep: ["MONTHLY"] },
        // El que acaba de cerrar: SOLO los modos por sesión/hora.
        {
          draft: computeRentalCharge(slices, byTeacher.get(external.id) ?? [], closedPeriod),
          keep: ["PER_SESSION", "PER_HOUR"],
        },
      ];

      for (const { draft, keep } of drafts) {
        if (!draft || !keep.includes(draft.rentalPeriod)) continue;

        const existing = await system.rentalCharge.findUnique({
          where: { teacherId_period: { teacherId: external.id, period: draft.period } },
          select: { id: true },
        });

        await system.rentalCharge.upsert({
          where: { teacherId_period: { teacherId: external.id, period: draft.period } },
          // `update: {}`: un cargo existente —incluso editado a mano— no se toca.
          update: {},
          create: {
            orgId: org.id,
            teacherId: external.id,
            period: draft.period,
            amount: draft.amount,
            currency: org.currency,
            dueDate,
            sessionsCount: draft.sessionsCount,
            minutesTotal: draft.minutesTotal,
            unspacedSessions: draft.unspacedSessions,
          },
          select: { id: true },
        });

        if (existing) skipped += 1;
        else created += 1;
      }
    }
  }

  return { orgs: orgs.length, created, skipped };
}
