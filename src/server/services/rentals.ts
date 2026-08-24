import { Prisma } from "@/generated/prisma/client";
import { civilToDb, dateInPeriod, dbToCivil, periodOf } from "@/lib/dates";
import { withOrg } from "@/lib/db";

import { money, type Money } from "./billing";
import { assertRole, can, type Actor } from "./permissions";
import { occurrencesForRange, type SessionException, type SlotInfo } from "./schedule";

/**
 * Alquileres de externos (S10, HU6.3, RN7/RN8): el cargo mensual de cada profe
 * EXTERNAL, generado por el cron del día 1 y administrado por owner/admin.
 *
 * El MOTOR es puro (`computeRentalCharge`): recibe los acuerdos, las ocurrencias del
 * período y el período, y devuelve el borrador del cargo — o null (cargo cero no se
 * genera; sin acuerdo tampoco). Decisiones S10:
 * - El cargo de un período usa EL acuerdo vigente al ÚLTIMO día de ese período: un solo
 *   acuerdo por cargo, SIN tramos (a diferencia de RN6-bis para staff).
 * - PER_SESSION/PER_HOUR cuentan ocurrencias NO canceladas (RN8) por su fecha MOSTRADA
 *   (una movida cobra donde se dictó); los grupos sin salón cuentan igual y se señalan.
 * - Sin imputaciones ni parciales (HU6.3): pagado completo con fecha y método.
 *
 * La aritmética es toda Decimal (regla S4); redondeo HALF_UP a 2 (patrón S9).
 */

export type RentalPeriodValue = "MONTHLY" | "PER_SESSION" | "PER_HOUR";
export type RentalStatusValue = "PENDING" | "PAID" | "OVERDUE" | "WAIVED";
export type PayMethodValue = "CASH" | "TRANSFER" | "OTHER";

export type RentalSlice = {
  /** Fecha civil desde la que rige. */
  validFrom: string;
  rentalPeriod: RentalPeriodValue;
  /** La tarifa: por mes, por sesión o por hora según `rentalPeriod`. */
  rentalAmount: Money;
};

export type RentalOccurrence = {
  /** Fecha MOSTRADA (donde se dictó — una movida cobra en su destino). */
  date: string;
  durationMin: number;
  cancelled: boolean;
  /** false = el grupo no tiene salón asignado: cuenta igual y se señala. */
  hasSpace: boolean;
};

export type RentalChargeDraft = {
  period: string;
  amount: Money;
  rentalPeriod: RentalPeriodValue;
  /** La tarifa aplicada (la del acuerdo vigente al último día del período). */
  rate: Money;
  /** Los HECHOS del cálculo (0 en MONTHLY). */
  sessionsCount: number;
  minutesTotal: number;
  unspacedSessions: number;
};

export class RentalRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RentalRuleError";
  }
}

function round2(value: Money): Money {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** El acuerdo vigente al ÚLTIMO día del período (decisión S10), o null. */
function sliceForPeriod(slices: readonly RentalSlice[], period: string): RentalSlice | null {
  const lastDay = dateInPeriod(period, 31);
  const sorted = [...slices].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  let current: RentalSlice | null = null;
  for (const slice of sorted) {
    if (slice.validFrom <= lastDay) current = slice;
  }
  return current;
}

/**
 * El cargo de alquiler de UN período (RN7). Null = no se genera: sin acuerdo vigente,
 * o cargo cero (sin sesiones dictadas en los modos por sesión/hora).
 */
export function computeRentalCharge(
  slices: readonly RentalSlice[],
  occurrences: readonly RentalOccurrence[],
  period: string,
): RentalChargeDraft | null {
  const slice = sliceForPeriod(slices, period);
  if (!slice) return null;

  if (slice.rentalPeriod === "MONTHLY") {
    return {
      period,
      amount: round2(slice.rentalAmount),
      rentalPeriod: "MONTHLY",
      rate: slice.rentalAmount,
      sessionsCount: 0,
      minutesTotal: 0,
      unspacedSessions: 0,
    };
  }

  // Defensivo: solo lo dictado DENTRO del período (la fecha mostrada decide).
  const counted = occurrences.filter((occ) => !occ.cancelled && periodOf(occ.date) === period);
  if (counted.length === 0) return null;

  const minutesTotal = counted.reduce((sum, occ) => sum + occ.durationMin, 0);
  const unspacedSessions = counted.filter((occ) => !occ.hasSpace).length;

  const amount =
    slice.rentalPeriod === "PER_SESSION"
      ? round2(slice.rentalAmount.mul(counted.length))
      : round2(slice.rentalAmount.mul(minutesTotal).div(60));

  if (slice.rentalPeriod === "PER_HOUR" && minutesTotal === 0) return null;

  return {
    period,
    amount,
    rentalPeriod: slice.rentalPeriod,
    rate: slice.rentalAmount,
    sessionsCount: counted.length,
    minutesTotal,
    unspacedSessions,
  };
}

// ─── Capa con base: overview, detalle y mutaciones (owner/admin) ───────────────────────

function assertCanManage(actor: Actor): void {
  // La misma llave contable que acuerdos y liquidaciones (Plan §4).
  if (!can(actor, "settlements:manage")) assertRole(actor, ["OWNER", "ADMIN"]);
}

export type RentalChargeItem = {
  id: string;
  period: string;
  /** Numérico plano, solo para mostrar. */
  amount: number;
  status: RentalStatusValue;
  dueDate: string;
  paidAt: string | null;
  method: PayMethodValue | null;
  sessionsCount: number;
  minutesTotal: number;
  unspacedSessions: number;
};

export type RentalOverviewRow = {
  teacherId: string;
  displayName: string;
  charge: RentalChargeItem | null;
  /** Sin cargo: el motivo se CANTA — sin acuerdo, o simplemente sin cargo generado. */
  reason: "charged" | "no-agreement" | "no-charge";
};

export type RentalsOverview = {
  period: string;
  rows: RentalOverviewRow[];
};

function toItem(row: {
  id: string;
  period: string;
  amount: Prisma.Decimal;
  status: string;
  dueDate: Date;
  paidAt: Date | null;
  method: string | null;
  sessionsCount: number;
  minutesTotal: number;
  unspacedSessions: number;
}): RentalChargeItem {
  return {
    id: row.id,
    period: row.period,
    amount: (row.amount as Money).toNumber(),
    status: row.status as RentalStatusValue,
    dueDate: dbToCivil(row.dueDate),
    paidAt: row.paidAt ? dbToCivil(row.paidAt) : null,
    method: row.method as PayMethodValue | null,
    sessionsCount: row.sessionsCount,
    minutesTotal: row.minutesTotal,
    unspacedSessions: row.unspacedSessions,
  };
}

/** Los externos del estudio con su cargo del período (o el motivo de que no haya). */
export async function rentalsOverview(actor: Actor, period: string): Promise<RentalsOverview> {
  assertCanManage(actor);
  const org = withOrg(actor.orgId);

  const [externals, charges] = await Promise.all([
    org.teacherProfile.findMany({
      where: { kind: "EXTERNAL" },
      orderBy: [{ createdAt: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        displayName: true,
        agreements: { where: { type: "RENTAL" }, select: { id: true }, take: 1 },
      },
    }),
    org.rentalCharge.findMany({ where: { period } }),
  ]);

  const chargeByTeacher = new Map(charges.map((charge) => [charge.teacherId, charge]));

  return {
    period,
    rows: externals.map((external) => {
      const charge = chargeByTeacher.get(external.id) ?? null;
      return {
        teacherId: external.id,
        displayName: external.displayName,
        charge: charge ? toItem(charge) : null,
        reason: charge
          ? "charged"
          : external.agreements.length === 0
            ? "no-agreement"
            : "no-charge",
      };
    }),
  };
}

export type RentalDetailSession = {
  date: string;
  startTime: string;
  durationMin: number;
  groupName: string;
  spaceName: string | null;
  cancelled: boolean;
};

export type RentalDetail = {
  teacher: { id: string; displayName: string };
  period: string;
  charge: RentalChargeItem | null;
  /** La tarifa y el modo del acuerdo vigente al último día del período (si hay). */
  rate: number | null;
  rentalPeriod: RentalPeriodValue | null;
  /** Las ocurrencias del período, recomputadas en vivo: el contexto del cálculo. */
  sessions: RentalDetailSession[];
};

/** El detalle del cálculo (HU6.3): sesiones contadas, tarifa, y la señal de sin-salón. */
export async function rentalDetail(
  actor: Actor,
  teacherId: string,
  period: string,
): Promise<RentalDetail> {
  assertCanManage(actor);
  const org = withOrg(actor.orgId);

  const teacher = await org.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { id: true, displayName: true, kind: true },
  });
  if (!teacher || teacher.kind !== "EXTERNAL") {
    throw new RentalRuleError("Ese perfil no es de un profe externo.");
  }

  const from = dateInPeriod(period, 1);
  const to = dateInPeriod(period, 31);

  const [charge, agreements, groups, exceptionRows] = await Promise.all([
    org.rentalCharge.findFirst({ where: { teacherId, period } }),
    org.agreement.findMany({
      where: { teacherId, type: "RENTAL" },
      orderBy: { validFrom: "asc" },
      select: { validFrom: true, rentalAmount: true, rentalPeriod: true },
    }),
    org.classGroup.findMany({
      where: { teacherId, active: true },
      select: {
        id: true,
        name: true,
        space: { select: { name: true } },
        slots: { select: { id: true, weekday: true, startTime: true, durationMin: true } },
      },
    }),
    org.classSession.findMany({
      where: {
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

  const slices: RentalSlice[] = agreements
    .filter((a) => a.rentalAmount !== null && a.rentalPeriod !== null)
    .map((a) => ({
      validFrom: dbToCivil(a.validFrom),
      rentalAmount: a.rentalAmount as Money,
      rentalPeriod: a.rentalPeriod as RentalPeriodValue,
    }));
  const slice = sliceForPeriod(slices, period);

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

  const sessions = occurrencesForRange(slots, exceptions, { from, to })
    .map((occurrence): RentalDetailSession => {
      const group = groupById.get(occurrence.groupId)!;
      return {
        date: occurrence.date,
        startTime: occurrence.startTime,
        durationMin: occurrence.durationMin,
        groupName: group.name,
        spaceName: group.space?.name ?? null,
        cancelled: occurrence.status === "CANCELLED",
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  return {
    teacher: { id: teacher.id, displayName: teacher.displayName },
    period,
    charge: charge ? toItem(charge) : null,
    rate: slice ? slice.rentalAmount.toNumber() : null,
    rentalPeriod: slice?.rentalPeriod ?? null,
    sessions,
  };
}

/** Editar el monto: solo PENDING (decisión S10, mismo espíritu que RN2). */
export async function updateRentalAmount(
  actor: Actor,
  chargeId: string,
  amount: number,
): Promise<void> {
  assertCanManage(actor);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RentalRuleError("El monto tiene que ser mayor a cero.");
  }

  const updated = await withOrg(actor.orgId).rentalCharge.updateMany({
    where: { id: chargeId, status: "PENDING" },
    data: { amount: money(amount) },
  });
  if (updated.count === 0) {
    throw new RentalRuleError("Solo un cargo pendiente admite editar el monto.");
  }
}

/** Marcar pagado (HU6.3): completo, con fecha y método. Una vencida paga directo (RN3). */
export async function markRentalPaid(
  actor: Actor,
  chargeId: string,
  input: { paidAt: string; method: PayMethodValue },
): Promise<void> {
  assertCanManage(actor);

  const updated = await withOrg(actor.orgId).rentalCharge.updateMany({
    where: { id: chargeId, status: { in: ["PENDING", "OVERDUE"] } },
    data: { status: "PAID", paidAt: civilToDb(input.paidAt), method: input.method },
  });
  if (updated.count === 0) {
    throw new RentalRuleError("Ese cargo no está pendiente: no se puede marcar pagado.");
  }
}

/** Exonerar (RN3: jamás una pagada). Confirmación en la UI; acá la regla dura. */
export async function waiveRentalCharge(actor: Actor, chargeId: string): Promise<void> {
  assertCanManage(actor);

  const updated = await withOrg(actor.orgId).rentalCharge.updateMany({
    where: { id: chargeId, status: { in: ["PENDING", "OVERDUE"] } },
    data: { status: "WAIVED" },
  });
  if (updated.count === 0) {
    throw new RentalRuleError("Ese cargo no está pendiente: no se puede exonerar.");
  }
}
