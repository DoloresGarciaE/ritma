import { Prisma } from "@/generated/prisma/client";
import {
  civilDateOf,
  civilToDb,
  dateInPeriod,
  daysInPeriod,
  dbToCivil,
  periodOf,
  todayInTz,
} from "@/lib/dates";
import { withOrg, type OrgClient } from "@/lib/db";

import { sumMoney, ZERO, type Money } from "./billing";
import { assertRole, can, type Actor, type DataScope } from "./permissions";

/**
 * Liquidaciones (S9, HU6.2/HU6.4): la fórmula RN6 en UN solo lugar, pura y en Decimal.
 * El Plan §13 lo advierte sin vueltas: un cálculo de liquidación con errores mina la
 * confianza — por eso este módulo no toca la base en su núcleo y carga la suite más
 * exhaustiva del proyecto (settlements.test.ts + tests/settlements.test.ts).
 *
 * La fórmula, literal (RN6):
 *   B (gross)              = pagos imputados a cuotas de grupos del profe en el período
 *                            — POR FECHA DE PAGO, y B toma la parte IMPUTADA al profe.
 *   R (studioShare)        = B × r, POR TRAMO de vigencia (RN6-bis): cada pago liquida
 *                            con el acuerdo vigente a su paidAt.
 *   C (collectedByTeacher) = el monto COMPLETO de los pagos que el profe cobró en mano
 *                            (receivedById = él; decisión de sesión S9: C es la plata
 *                            física — la caja cuadra siempre, aunque parte del pago se
 *                            haya imputado a otro o quedado como saldo a favor).
 *   N (netToTeacher)       = (B − R) − C. Puede ser NEGATIVO: el profe le debe al
 *                            estudio (§4.2: signo explícito, jamás solo color).
 *
 * Redondeo: cada tramo redondea su share a 2 decimales (HALF_UP) y R es LA SUMA DE LOS
 * TRAMOS — el total siempre cuadra con el detalle del drill-down, centavo a centavo.
 */

export type SettlementPayment = {
  paymentId: string;
  /** Fecha civil del pago (RN10): decide el tramo de vigencia. */
  paidAt: string;
  /** El monto COMPLETO del pago. */
  amount: Money;
  /** La suma de las imputaciones de ESTE pago a cuotas del profe (la parte B). */
  allocatedToTeacher: Money;
  /** true si `receivedById` es este profe (C toma `amount` entero). */
  collectedByTeacher: boolean;
};

export type AgreementSlice = {
  /** Fecha civil desde la que rige (inclusive: el mismo día ya liquida con el nuevo). */
  validFrom: string;
  /** Porcentaje de retención del estudio (30 = 30%). */
  studioPercent: Money;
};

export type SettlementTranche = {
  validFrom: string;
  studioPercent: Money;
  gross: Money;
  share: Money;
};

export type SettlementComputation = {
  gross: Money;
  studioShare: Money;
  collectedByTeacher: Money;
  netToTeacher: Money;
  /** Solo los tramos que recibieron pagos, por vigencia asc — el drill-down los lista. */
  tranches: SettlementTranche[];
};

/** Regla de liquidación violada: mensaje para la pantalla, no crash (patrón *RuleError). */
export class SettlementRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementRuleError";
  }
}

function round2(value: Money): Money {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function computeSettlement(
  payments: readonly SettlementPayment[],
  agreements: readonly AgreementSlice[],
): SettlementComputation {
  if (agreements.length === 0) {
    throw new SettlementRuleError(
      "El profe no tiene un acuerdo vigente: definilo en el equipo antes de liquidar.",
    );
  }

  // Vigencias ascendentes; el acuerdo de un pago es el ÚLTIMO validFrom ≤ paidAt.
  const slices = [...agreements].sort((a, b) => a.validFrom.localeCompare(b.validFrom));

  const trancheByValidFrom = new Map<string, { slice: AgreementSlice; gross: Money }>();
  let collected = ZERO;

  for (const payment of payments) {
    let current: AgreementSlice | undefined;
    for (const slice of slices) {
      if (slice.validFrom <= payment.paidAt) current = slice;
      else break;
    }
    if (!current) {
      throw new SettlementRuleError(
        `Sin acuerdo vigente al ${payment.paidAt}: el primero rige desde ${slices[0].validFrom}. ` +
          "Corregí la vigencia del acuerdo antes de liquidar.",
      );
    }

    const entry = trancheByValidFrom.get(current.validFrom) ?? { slice: current, gross: ZERO };
    entry.gross = entry.gross.add(payment.allocatedToTeacher);
    trancheByValidFrom.set(current.validFrom, entry);

    if (payment.collectedByTeacher) collected = collected.add(payment.amount);
  }

  const tranches: SettlementTranche[] = [...trancheByValidFrom.values()]
    .sort((a, b) => a.slice.validFrom.localeCompare(b.slice.validFrom))
    .map(({ slice, gross }) => ({
      validFrom: slice.validFrom,
      studioPercent: slice.studioPercent,
      gross,
      share: round2(gross.mul(slice.studioPercent).div(100)),
    }));

  const gross = sumMoney(tranches.map((tranche) => tranche.gross));
  const studioShare = sumMoney(tranches.map((tranche) => tranche.share));
  const netToTeacher = gross.minus(studioShare).minus(collected);

  return {
    gross,
    studioShare,
    collectedByTeacher: collected,
    netToTeacher,
    tranches,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// La capa con base: quién entra a B y C, el ciclo OPEN → CLOSED → PAID, y el
// congelado (RN12 se completa acá). El borrador del período en curso NO persiste:
// se calcula al abrir; cerrar persiste los números y vincula los pagos.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RN6-bis, la mitad "tardía" (decisión de sesión S9): una imputación hecha DESPUÉS de
 * que su pago quedó liquidado entra al B del período en que OCURRE, no al del pago —
 * cada peso se liquida una sola vez y el saldo a favor del alumno sigue vivo. Es exacto
 * porque SOLO se cierran períodos terminados: una imputación nueva (createdAt = hoy)
 * jamás puede clasificar a un período ya cerrado.
 */

export type SettlementNumbers = {
  gross: number;
  studioShare: number;
  collectedByTeacher: number;
  netToTeacher: number;
};

export type SettlementTeacherRow = {
  teacherId: string;
  displayName: string;
  /** false = perfil desvinculado (docente revocada): su plata igual se liquida. */
  linked: boolean;
  state: "draft" | "needs-agreement" | "closed" | "paid";
  numbers: SettlementNumbers | null;
  /** El mensaje del motor cuando falta acuerdo o la vigencia no cubre un pago. */
  agreementIssue?: string;
  settlementId?: string;
  /** Fechas civiles de la org, para mostrar. */
  closedAt?: string;
  paidAt?: string;
};

export type UnsettledBucket = { total: number; count: number };

export type SettlementOverview = {
  period: string;
  teachers: SettlementTeacherRow[];
  /** Imputaciones del período a cuotas de grupos SIN profe: se cantan, no se tragan. */
  unassigned: UnsettledBucket;
  /** Pagos "en mano" sin receivedById (los viejos de S4): ídem — sin atribuir. */
  unattributed: UnsettledBucket;
};

export type SettlementDetailPayment = {
  paymentId: string;
  /** Fecha civil real del pago. */
  paidAt: string;
  studentName: string;
  method: "CASH" | "TRANSFER" | "OTHER";
  amount: number;
  allocatedToTeacher: number;
  collectedByTeacher: boolean;
  /** Imputación tardía (RN6-bis): plata de un pago ya liquidado que liquida ESTE mes. */
  late: boolean;
};

export type SettlementDetail = {
  period: string;
  teacher: { id: string; displayName: string };
  state: SettlementTeacherRow["state"];
  numbers: SettlementNumbers;
  tranches: { validFrom: string; studioPercent: number; gross: number; share: number }[];
  payments: SettlementDetailPayment[];
  /** Saldo sin imputar de los pagos del período (informativo para el cierre). */
  unallocatedRemainder: number;
  closedAt?: string;
  paidAt?: string;
};

function assertCanManageSettlements(actor: Actor): void {
  if (!can(actor, "settlements:manage")) assertRole(actor, ["OWNER", "ADMIN"]);
}

async function assertStudio(org: OrgClient, orgId: string): Promise<void> {
  const organization = await org.organization.findUnique({
    where: { id: orgId },
    select: { type: true },
  });
  if (organization?.type !== "STUDIO") {
    throw new Error("Las liquidaciones existen solo en un estudio.");
  }
}

async function orgTimezone(org: OrgClient, orgId: string): Promise<string> {
  const organization = await org.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { timezone: true },
  });
  return organization.timezone;
}

function periodRange(period: string) {
  return {
    gte: civilToDb(dateInPeriod(period, 1)),
    lte: civilToDb(dateInPeriod(period, daysInPeriod(period))),
  };
}

/** Los acuerdos del profe como tramos del motor (solo REVENUE_SHARE con porcentaje). */
async function agreementSlices(org: OrgClient, teacherId: string): Promise<AgreementSlice[]> {
  const rows = await org.agreement.findMany({
    where: { teacherId, type: "REVENUE_SHARE", studioPercent: { not: null } },
    orderBy: { validFrom: "asc" },
    select: { validFrom: true, studioPercent: true },
  });
  return rows.map((row) => ({
    validFrom: dbToCivil(row.validFrom),
    studioPercent: row.studioPercent as Money,
  }));
}

type CollectedInputs = {
  engine: SettlementPayment[];
  detail: SettlementDetailPayment[];
  /** Ids de los pagos PRIMARIOS (paidAt en el período): los que el cierre vincula. */
  primaryIds: string[];
  unallocatedRemainder: Money;
};

/**
 * Junta B y C de un profe para un período. Primarios: pagos con paidAt en el período
 * que le imputaron cuotas O que él cobró en mano; sus imputaciones POSTERIORES a un
 * congelado no cuentan acá (son de otro mes). Tardíos: imputaciones de ESTE mes desde
 * pagos liquidados en meses anteriores (RN6-bis) — entran como entradas sintéticas con
 * C=0 (el pago completo ya se cobró en su mes).
 */
async function collectInputs(
  org: OrgClient,
  teacherId: string,
  period: string,
  timezone: string,
): Promise<CollectedInputs> {
  const range = periodRange(period);

  const primaries = await org.payment.findMany({
    where: {
      paidAt: range,
      OR: [
        { receivedById: teacherId },
        {
          allocations: {
            some: { charge: { enrollment: { group: { teacherId } } } },
          },
        },
      ],
    },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      amount: true,
      paidAt: true,
      method: true,
      receivedById: true,
      settlement: { select: { closedAt: true } },
      student: { select: { name: true } },
      allocations: {
        select: {
          amount: true,
          createdAt: true,
          charge: {
            select: { enrollment: { select: { group: { select: { teacherId: true } } } } },
          },
        },
      },
    },
  });

  const engine: SettlementPayment[] = [];
  const detail: SettlementDetailPayment[] = [];
  let unallocatedRemainder = ZERO;

  for (const payment of primaries) {
    const allocatedToTeacher = sumMoney(
      payment.allocations
        .filter(
          (allocation) =>
            allocation.charge.enrollment.group.teacherId === teacherId &&
            // Una imputación posterior al congelado del pago es de OTRO período.
            (payment.settlement === null || allocation.createdAt <= payment.settlement.closedAt),
        )
        .map((allocation) => allocation.amount),
    );
    const collectedByTeacher = payment.receivedById === teacherId;
    if (allocatedToTeacher.isZero() && !collectedByTeacher) continue;

    const totalAllocated = sumMoney(payment.allocations.map((allocation) => allocation.amount));
    unallocatedRemainder = unallocatedRemainder.add(
      (payment.amount as Money).minus(totalAllocated),
    );

    engine.push({
      paymentId: payment.id,
      paidAt: dbToCivil(payment.paidAt),
      amount: payment.amount as Money,
      allocatedToTeacher,
      collectedByTeacher,
    });
    detail.push({
      paymentId: payment.id,
      paidAt: dbToCivil(payment.paidAt),
      studentName: payment.student.name,
      method: payment.method,
      amount: (payment.amount as Money).toNumber(),
      allocatedToTeacher: allocatedToTeacher.toNumber(),
      collectedByTeacher,
      late: false,
    });
  }

  // Tardías (RN6-bis): imputaciones de este mes desde pagos ya liquidados ANTES.
  // El fetch acota por createdAt desde el arranque del período (con la zona, el filtro
  // fino lo hace civilDateOf); el clasificador exige createdAt > closedAt del congelado.
  const lateCandidates = await org.paymentAllocation.findMany({
    where: {
      charge: { enrollment: { group: { teacherId } } },
      createdAt: { gte: civilToDb(dateInPeriod(period, 1)) },
      payment: { settlementId: { not: null }, paidAt: { lt: range.gte } },
    },
    select: {
      amount: true,
      createdAt: true,
      payment: {
        select: {
          id: true,
          paidAt: true,
          method: true,
          student: { select: { name: true } },
          settlement: { select: { closedAt: true } },
        },
      },
    },
  });

  for (const allocation of lateCandidates) {
    const settlement = allocation.payment.settlement;
    if (!settlement || allocation.createdAt <= settlement.closedAt) continue;
    const civil = civilDateOf(allocation.createdAt, timezone);
    if (periodOf(civil) !== period) continue;

    engine.push({
      paymentId: allocation.payment.id,
      // Para el TRAMO rige la fecha en que la plata liquida (RN6-bis).
      paidAt: civil,
      amount: allocation.amount as Money,
      allocatedToTeacher: allocation.amount as Money,
      collectedByTeacher: false,
    });
    detail.push({
      paymentId: allocation.payment.id,
      paidAt: dbToCivil(allocation.payment.paidAt),
      studentName: allocation.payment.student.name,
      method: allocation.payment.method,
      amount: (allocation.amount as Money).toNumber(),
      allocatedToTeacher: (allocation.amount as Money).toNumber(),
      collectedByTeacher: false,
      late: true,
    });
  }

  return {
    engine,
    detail,
    primaryIds: primaries.map((payment) => payment.id),
    unallocatedRemainder,
  };
}

function toNumbers(result: SettlementComputation): SettlementNumbers {
  return {
    gross: result.gross.toNumber(),
    studioShare: result.studioShare.toNumber(),
    collectedByTeacher: result.collectedByTeacher.toNumber(),
    netToTeacher: result.netToTeacher.toNumber(),
  };
}

/**
 * La pantalla de Liquidaciones (HU6.2, F3): una fila por profe STAFF — también los
 * desvinculados: revocar el acceso no borra la plata — con borrador vivo o números
 * cerrados, más los dos baldes que SE CANTAN: grupos sin profe y cobros en mano sin
 * atribuir. Solo owner/admin de un STUDIO.
 */
export async function settlementOverview(
  actor: Actor,
  period: string,
): Promise<SettlementOverview> {
  assertCanManageSettlements(actor);
  const org = withOrg(actor.orgId);
  await assertStudio(org, actor.orgId);
  const timezone = await orgTimezone(org, actor.orgId);

  const [staff, closed] = await Promise.all([
    org.teacherProfile.findMany({
      where: { kind: "STAFF" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, displayName: true, membershipUserId: true },
    }),
    org.settlement.findMany({ where: { period } }),
  ]);
  const closedByTeacher = new Map(closed.map((settlement) => [settlement.teacherId, settlement]));

  const teachers: SettlementTeacherRow[] = [];
  for (const profile of staff) {
    const existing = closedByTeacher.get(profile.id);
    if (existing) {
      teachers.push({
        teacherId: profile.id,
        displayName: profile.displayName,
        linked: profile.membershipUserId !== null,
        state: existing.status === "PAID" ? "paid" : "closed",
        numbers: {
          gross: (existing.gross as Money).toNumber(),
          studioShare: (existing.studioShare as Money).toNumber(),
          collectedByTeacher: (existing.collectedByTeacher as Money).toNumber(),
          netToTeacher: (existing.netToTeacher as Money).toNumber(),
        },
        settlementId: existing.id,
        closedAt: civilDateOf(existing.closedAt, timezone),
        paidAt: existing.paidAt ? civilDateOf(existing.paidAt, timezone) : undefined,
      });
      continue;
    }

    const [slices, inputs] = await Promise.all([
      agreementSlices(org, profile.id),
      collectInputs(org, profile.id, period, timezone),
    ]);
    try {
      const result = computeSettlement(inputs.engine, slices);
      teachers.push({
        teacherId: profile.id,
        displayName: profile.displayName,
        linked: profile.membershipUserId !== null,
        state: "draft",
        numbers: toNumbers(result),
      });
    } catch (error) {
      if (!(error instanceof SettlementRuleError)) throw error;
      teachers.push({
        teacherId: profile.id,
        displayName: profile.displayName,
        linked: profile.membershipUserId !== null,
        state: "needs-agreement",
        numbers: null,
        agreementIssue: error.message,
      });
    }
  }

  const range = periodRange(period);
  const [unassignedAllocations, unattributedPayments] = await Promise.all([
    org.paymentAllocation.findMany({
      where: {
        payment: { paidAt: range },
        charge: { enrollment: { group: { teacherId: null } } },
      },
      select: { amount: true },
    }),
    org.payment.findMany({
      where: { paidAt: range, receivedBy: "TEACHER", receivedById: null },
      select: { amount: true },
    }),
  ]);

  return {
    period,
    teachers,
    unassigned: {
      total: sumMoney(unassignedAllocations.map((a) => a.amount)).toNumber(),
      count: unassignedAllocations.length,
    },
    unattributed: {
      total: sumMoney(unattributedPayments.map((p) => p.amount as Money)).toNumber(),
      count: unattributedPayments.length,
    },
  };
}

/**
 * El drill-down (F3 paso 2, HU6.4): los pagos que componen cada número, con tramos.
 * Owner/admin ven a cualquiera; un TEACHER solo la suya (settlements:viewOwn + scope S7).
 */
export async function settlementDetail(
  actor: Actor,
  scope: DataScope,
  teacherId: string,
  period: string,
): Promise<SettlementDetail> {
  if (!can(actor, "settlements:manage")) {
    if (scope.kind !== "teacher" || scope.teacherProfileId !== teacherId) {
      throw new SettlementRuleError("Esta liquidación no es tuya.");
    }
  }
  const org = withOrg(actor.orgId);
  const timezone = await orgTimezone(org, actor.orgId);

  const teacher = await org.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { id: true, displayName: true },
  });
  if (!teacher) throw new Error("El perfil no pertenece a esta organización.");

  const [slices, inputs, existing] = await Promise.all([
    agreementSlices(org, teacherId),
    collectInputs(org, teacherId, period, timezone),
    org.settlement.findUnique({ where: { teacherId_period: { teacherId, period } } }),
  ]);

  const result = computeSettlement(inputs.engine, slices);
  const numbers = existing
    ? {
        gross: (existing.gross as Money).toNumber(),
        studioShare: (existing.studioShare as Money).toNumber(),
        collectedByTeacher: (existing.collectedByTeacher as Money).toNumber(),
        netToTeacher: (existing.netToTeacher as Money).toNumber(),
      }
    : toNumbers(result);

  return {
    period,
    teacher,
    state: existing ? (existing.status === "PAID" ? "paid" : "closed") : "draft",
    numbers,
    tranches: result.tranches.map((tranche) => ({
      validFrom: tranche.validFrom,
      studioPercent: tranche.studioPercent.toNumber(),
      gross: tranche.gross.toNumber(),
      share: tranche.share.toNumber(),
    })),
    payments: inputs.detail,
    unallocatedRemainder: inputs.unallocatedRemainder.toNumber(),
    closedAt: existing ? civilDateOf(existing.closedAt, timezone) : undefined,
    paidAt: existing?.paidAt ? civilDateOf(existing.paidAt, timezone) : undefined,
  };
}

/**
 * Cerrar (F3 paso 3): SOLO períodos terminados — el del mes en curso es un borrador
 * vivo, y esta restricción es la que hace exacta a la regla tardía (una imputación
 * nueva jamás clasifica a un período cerrado). Transaccional: persiste los números y
 * vincula `settlementId` en cada pago primario; esos pagos quedan INMUTABLES (RN12).
 */
export async function closeSettlement(
  actor: Actor,
  teacherId: string,
  period: string,
): Promise<{ settlementId: string; numbers: SettlementNumbers }> {
  assertCanManageSettlements(actor);
  const org = withOrg(actor.orgId);
  await assertStudio(org, actor.orgId);
  const timezone = await orgTimezone(org, actor.orgId);

  const current = periodOf(todayInTz(timezone));
  if (period >= current) {
    throw new SettlementRuleError(
      "El período en curso todavía está abierto: cerralo cuando termine el mes.",
    );
  }

  const profile = await org.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { kind: true },
  });
  if (!profile) throw new Error("El perfil no pertenece a esta organización.");
  if (profile.kind !== "STAFF") {
    throw new SettlementRuleError("Solo los profes staff se liquidan (la titular no).");
  }

  const [slices, inputs] = await Promise.all([
    agreementSlices(org, teacherId),
    collectInputs(org, teacherId, period, timezone),
  ]);
  const result = computeSettlement(inputs.engine, slices);

  try {
    const settlement = await org.$transaction(async (tx) => {
      const scoped = tx as unknown as OrgClient;

      const created = await scoped.settlement.create({
        data: {
          orgId: actor.orgId,
          teacherId,
          period,
          gross: result.gross,
          studioShare: result.studioShare,
          collectedByTeacher: result.collectedByTeacher,
          netToTeacher: result.netToTeacher,
          status: "CLOSED",
          closedAt: new Date(),
        },
        select: { id: true },
      });

      // Congela los PRIMARIOS que nadie congeló antes (un pago compartido puede haber
      // quedado vinculado al cierre de otro profe: cuenta igual, se congela una vez).
      await scoped.payment.updateMany({
        where: { id: { in: inputs.primaryIds }, settlementId: null },
        data: { settlementId: created.id },
      });

      return created;
    });

    return { settlementId: settlement.id, numbers: toNumbers(result) };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new SettlementRuleError("Esa liquidación ya está cerrada.");
    }
    throw error;
  }
}

/** Marca que la diferencia se saldó (F3 paso 4). Solo una CLOSED puede pasar a PAID. */
export async function markSettlementPaid(actor: Actor, settlementId: string): Promise<void> {
  assertCanManageSettlements(actor);

  const updated = await withOrg(actor.orgId).settlement.updateMany({
    where: { id: settlementId, status: "CLOSED" },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (updated.count === 0) {
    throw new SettlementRuleError("Esa liquidación no existe o no está cerrada.");
  }
}

/**
 * La vista del profe (HU6.4, settlements:viewOwn): SUS liquidaciones — el borrador del
 * período en curso más el historial cerrado, misma fuente que la pantalla de la dueña.
 */
export async function teacherSettlements(
  orgId: string,
  scope: DataScope,
): Promise<{ current: SettlementTeacherRow | null; history: SettlementTeacherRow[] }> {
  if (scope.kind !== "teacher" || !scope.teacherProfileId) {
    throw new Error("Esta vista es del profe: owner/admin usan la pantalla del estudio.");
  }
  const org = withOrg(orgId);
  const timezone = await orgTimezone(org, orgId);
  const teacherId = scope.teacherProfileId;

  const profile = await org.teacherProfile.findUniqueOrThrow({
    where: { id: teacherId },
    select: { id: true, displayName: true, kind: true, membershipUserId: true },
  });
  if (profile.kind !== "STAFF") return { current: null, history: [] };

  const period = periodOf(todayInTz(timezone));
  const [slices, inputs, closed] = await Promise.all([
    agreementSlices(org, teacherId),
    collectInputs(org, teacherId, period, timezone),
    org.settlement.findMany({
      where: { teacherId },
      orderBy: { period: "desc" },
    }),
  ]);

  let current: SettlementTeacherRow | null;
  try {
    current = {
      teacherId,
      displayName: profile.displayName,
      linked: true,
      state: "draft",
      numbers: toNumbers(computeSettlement(inputs.engine, slices)),
    };
  } catch (error) {
    if (!(error instanceof SettlementRuleError)) throw error;
    current = {
      teacherId,
      displayName: profile.displayName,
      linked: true,
      state: "needs-agreement",
      numbers: null,
      agreementIssue: error.message,
    };
  }

  return {
    current,
    history: closed.map((settlement) => ({
      teacherId,
      displayName: profile.displayName,
      linked: true,
      state: settlement.status === "PAID" ? "paid" : "closed",
      numbers: {
        gross: (settlement.gross as Money).toNumber(),
        studioShare: (settlement.studioShare as Money).toNumber(),
        collectedByTeacher: (settlement.collectedByTeacher as Money).toNumber(),
        netToTeacher: (settlement.netToTeacher as Money).toNumber(),
      },
      settlementId: settlement.id,
      closedAt: civilDateOf(settlement.closedAt, timezone),
      paidAt: settlement.paidAt ? civilDateOf(settlement.paidAt, timezone) : undefined,
    })),
  };
}
