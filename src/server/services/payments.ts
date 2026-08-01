import { withOrg, type OrgClient } from "@/lib/db";
import { civilToDb, dbToCivil, todayInTz } from "@/lib/dates";
import { generateReceiptToken } from "@/lib/receipts";

import {
  allocateGreedy,
  money,
  recomputeChargeStatus,
  sumMoney,
  validateAllocations,
  ZERO,
  type ChargeStatusValue,
  type Money,
} from "./billing";

/**
 * Servicios de pagos (HU4.3–HU4.4, RN4–RN5): la capa que junta datos, le pregunta al
 * motor puro de `billing.ts` y persiste — TRANSACCIÓN O NADA (decisión S4): pago,
 * imputaciones y recálculo de estados entran juntos o no entra nada.
 *
 * Acá no se suma ni resta plata: toda la aritmética es del motor (`money`, `sumMoney`,
 * `allocateGreedy`, `recomputeChargeStatus`). El saldo a favor es un DERIVADO
 * (pagos − imputaciones), nunca una columna.
 *
 * Todo por `withOrg(orgId)`; `studentId` y `chargeId` que vienen del cliente se verifican
 * contra la org (y contra el alumno) ANTES de escribir.
 */

export type PayMethodValue = "CASH" | "TRANSFER" | "OTHER";
export type ReceivedByValue = "STUDIO" | "TEACHER";

export type PaymentInput = {
  studentId: string;
  amount: number;
  method: PayMethodValue;
  receivedBy?: ReceivedByValue;
  /** Fecha civil del pago ("yyyy-MM-dd"), default hoy en la UI. */
  paidAt: string;
  /** Ausente → imputación automática (RN4). Presente → edición manual (HU4.3). */
  allocations?: { chargeId: string; amount: number }[];
};

/** Regla de negocio alcanzable desde la UI: mensaje de formulario, no crash. */
export class PaymentRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentRuleError";
  }
}

/** Estados que pueden recibir plata. */
const OPEN: ChargeStatusValue[] = ["PENDING", "PARTIAL", "OVERDUE"];

const OPEN_CHARGE_SELECT = {
  id: true,
  amount: true,
  status: true,
  dueDate: true,
  period: true,
  allocations: { select: { amount: true } },
  enrollment: { select: { group: { select: { name: true } } } },
} as const;

/** Cuotas abiertas del alumno, antigua-primero (RN4), con su remanente en Decimal. */
async function openChargesOf(client: OrgClient, studentId: string) {
  const rows = await client.charge.findMany({
    where: { enrollment: { studentId }, status: { in: OPEN } },
    orderBy: [{ period: "asc" }, { dueDate: "asc" }, { id: "asc" }],
    select: OPEN_CHARGE_SELECT,
  });

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount as Money,
    status: row.status as ChargeStatusValue,
    dueDate: dbToCivil(row.dueDate),
    period: row.period,
    groupName: row.enrollment.group.name,
    remaining: (row.amount as Money).minus(sumMoney(row.allocations.map((a) => a.amount))),
  }));
}

/** Pagos del alumno con remanente sin imputar, viejo-primero (RN4: el crédito). */
async function paymentRemaindersOf(client: OrgClient, studentId: string) {
  const rows = await client.payment.findMany({
    where: { studentId },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, amount: true, allocations: { select: { amount: true } } },
  });

  return rows
    .map((row) => ({
      paymentId: row.id,
      remaining: (row.amount as Money).minus(sumMoney(row.allocations.map((a) => a.amount))),
    }))
    .filter((row) => row.remaining.greaterThan(ZERO));
}

/**
 * Recalcula el estado de las cuotas tocadas por LA ÚNICA fuente de verdad
 * (`recomputeChargeStatus`, RN3). Corre dentro de la transacción del caller.
 */
async function recomputeCharges(
  client: OrgClient,
  chargeIds: Iterable<string>,
  today: string,
): Promise<void> {
  for (const chargeId of new Set(chargeIds)) {
    const charge = await client.charge.findUniqueOrThrow({
      where: { id: chargeId },
      select: {
        amount: true,
        status: true,
        dueDate: true,
        allocations: { select: { amount: true } },
      },
    });

    const status = recomputeChargeStatus(
      {
        amount: charge.amount as Money,
        status: charge.status as ChargeStatusValue,
        dueDate: dbToCivil(charge.dueDate),
      },
      sumMoney(charge.allocations.map((a) => a.amount)),
      today,
    );

    if (status !== charge.status) {
      await client.charge.update({
        where: { id: chargeId },
        data: { status },
        select: { id: true },
      });
    }
  }
}

/**
 * Registrar un pago (HU4.3): pago + imputaciones + recálculo, EN UNA TRANSACCIÓN.
 *
 * - Sin `allocations`: imputación automática antigua-primero (RN4); el excedente queda
 *   como crédito (no se imputa a nada).
 * - Con `allocations` (edición manual, HU4.4): cada `chargeId` se verifica contra la org
 *   Y contra el alumno leyendo sus cuotas abiertas adentro de la transacción, y las
 *   invariantes duras las valida el motor (`validateAllocations`).
 */
export async function createPayment(orgId: string, input: PaymentInput): Promise<{ id: string }> {
  const org = withOrg(orgId);

  return org.$transaction(async (tx) => {
    const scoped = tx as unknown as OrgClient;

    const student = await scoped.student.findUnique({
      where: { id: input.studentId },
      select: { id: true },
    });
    if (!student) throw new Error("El alumno no pertenece a esta organización.");

    const settings = await scoped.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { currency: true, timezone: true },
    });
    const today = todayInTz(settings.timezone);

    const amount = money(input.amount);
    if (amount.lessThanOrEqualTo(ZERO)) {
      throw new PaymentRuleError("El pago tiene que ser mayor a cero.");
    }

    const open = await openChargesOf(scoped, input.studentId);
    const openWithRemainder = open.filter((charge) => charge.remaining.greaterThan(ZERO));

    let drafts: { chargeId: string; amount: Money }[];
    if (input.allocations) {
      const manual = input.allocations.map((allocation) => ({
        chargeId: allocation.chargeId,
        amount: money(allocation.amount),
      }));
      // El mapa de remanentes sale de las cuotas DEL ALUMNO: una cuota ajena (de otra
      // org u otro alumno) no está y el motor la rechaza.
      const remainingByCharge = new Map(
        openWithRemainder.map((charge) => [charge.id, charge.remaining]),
      );
      const error = validateAllocations(amount, manual, remainingByCharge);
      if (error) throw new PaymentRuleError(error);
      drafts = manual;
    } else {
      drafts = allocateGreedy(
        [{ paymentId: "nuevo", remaining: amount }],
        openWithRemainder.map((charge) => ({ chargeId: charge.id, remaining: charge.remaining })),
      ).map((draft) => ({ chargeId: draft.chargeId, amount: draft.amount }));
    }

    const payment = await scoped.payment.create({
      data: {
        orgId,
        studentId: input.studentId,
        amount,
        currency: settings.currency,
        method: input.method,
        receivedBy: input.receivedBy ?? "STUDIO",
        paidAt: civilToDb(input.paidAt),
        receiptToken: generateReceiptToken(),
        ...(drafts.length > 0
          ? {
              allocations: {
                // orgId EXPLÍCITO: la escritura anidada no pasa por el hook del hijo.
                create: drafts.map((draft) => ({
                  orgId,
                  chargeId: draft.chargeId,
                  amount: draft.amount,
                })),
              },
            }
          : {}),
      },
      select: { id: true },
    });

    await recomputeCharges(
      scoped,
      drafts.map((draft) => draft.chargeId),
      today,
    );

    return payment;
  });
}

/**
 * Eliminar un pago (propuesta RN12): solo pagos SIN liquidación — en Fase 1, todos; la
 * inmutabilidad llega con el cierre de liquidaciones (RN6, S9). La transacción borra el
 * pago (las imputaciones caen por cascada) y recalcula los estados: las cuotas vuelven
 * solas a PENDING/PARTIAL/OVERDUE según su calendario.
 */
export async function deletePayment(orgId: string, paymentId: string): Promise<void> {
  const org = withOrg(orgId);

  await org.$transaction(async (tx) => {
    const scoped = tx as unknown as OrgClient;

    const payment = await scoped.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, allocations: { select: { chargeId: true } } },
    });
    if (!payment) throw new Error("El pago no pertenece a esta organización.");

    const settings = await scoped.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true },
    });

    await scoped.payment.delete({ where: { id: paymentId }, select: { id: true } });

    await recomputeCharges(
      scoped,
      payment.allocations.map((allocation) => allocation.chargeId),
      todayInTz(settings.timezone),
    );
  });
}

/**
 * Aplica el CRÉDITO existente del alumno a sus cuotas abiertas (RN4: "el excedente se
 * imputa automáticamente a la próxima cuota generada"). La llaman el cron de generación
 * (tras crear las cuotas del período) y el alta de inscripción (tras crear la cuota
 * inicial). Idempotente: sin crédito o sin cuotas abiertas, no escribe nada.
 */
export async function applyStudentCredit(
  orgId: string,
  studentId: string,
  today: string,
): Promise<{ applied: number }> {
  const org = withOrg(orgId);

  return org.$transaction(async (tx) => {
    const scoped = tx as unknown as OrgClient;

    const remainders = await paymentRemaindersOf(scoped, studentId);
    if (remainders.length === 0) return { applied: 0 };

    const open = await openChargesOf(scoped, studentId);
    const openWithRemainder = open.filter((charge) => charge.remaining.greaterThan(ZERO));
    if (openWithRemainder.length === 0) return { applied: 0 };

    const drafts = allocateGreedy(
      remainders,
      openWithRemainder.map((charge) => ({ chargeId: charge.id, remaining: charge.remaining })),
    );
    if (drafts.length === 0) return { applied: 0 };

    await scoped.paymentAllocation.createMany({
      data: drafts.map((draft) => ({
        orgId,
        paymentId: draft.paymentId,
        chargeId: draft.chargeId,
        amount: draft.amount,
      })),
    });

    await recomputeCharges(
      scoped,
      drafts.map((draft) => draft.chargeId),
      today,
    );

    return { applied: drafts.length };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas para la UI. Decimal → number solo acá, al borde, para mostrar.
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentListItem = {
  id: string;
  amount: number;
  currency: string;
  method: PayMethodValue;
  receivedBy: ReceivedByValue;
  /** Fecha civil. */
  paidAt: string;
  hasAttachment: boolean;
  allocations: { chargeId: string; period: string; groupName: string; amount: number }[];
};

/** Los pagos del alumno, más nuevos primero, con sus imputaciones legibles. */
export async function listPaymentsForStudent(
  orgId: string,
  studentId: string,
): Promise<PaymentListItem[]> {
  const rows = await withOrg(orgId).payment.findMany({
    where: { studentId },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      receivedBy: true,
      paidAt: true,
      attachmentKey: true,
      allocations: {
        orderBy: { chargeId: "asc" },
        select: {
          chargeId: true,
          amount: true,
          charge: {
            select: {
              period: true,
              enrollment: { select: { group: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    amount: (row.amount as Money).toNumber(),
    currency: row.currency,
    method: row.method,
    receivedBy: row.receivedBy,
    paidAt: dbToCivil(row.paidAt),
    hasAttachment: row.attachmentKey !== null,
    allocations: row.allocations.map((allocation) => ({
      chargeId: allocation.chargeId,
      period: allocation.charge.period,
      groupName: allocation.charge.enrollment.group.name,
      amount: (allocation.amount as Money).toNumber(),
    })),
  }));
}

export type PaymentContext = {
  /** Deuda total del alumno (suma de remanentes de sus cuotas abiertas). */
  debt: number;
  /** Saldo a favor (pagos − imputaciones). */
  credit: number;
  openCharges: {
    id: string;
    period: string;
    groupName: string;
    status: ChargeStatusValue;
    dueDate: string;
    remaining: number;
  }[];
};

/**
 * Lo que el sheet "Registrar pago" necesita: la deuda (pre-carga el monto, HU4.3), el
 * crédito visible y las cuotas abiertas para la vista de imputación.
 */
export async function paymentContext(orgId: string, studentId: string): Promise<PaymentContext> {
  const org = withOrg(orgId);

  const [open, remainders] = await Promise.all([
    openChargesOf(org, studentId),
    paymentRemaindersOf(org, studentId),
  ]);

  const openWithRemainder = open.filter((charge) => charge.remaining.greaterThan(ZERO));

  return {
    debt: sumMoney(openWithRemainder.map((charge) => charge.remaining)).toNumber(),
    credit: sumMoney(remainders.map((remainder) => remainder.remaining)).toNumber(),
    openCharges: openWithRemainder.map((charge) => ({
      id: charge.id,
      period: charge.period,
      groupName: charge.groupName,
      status: charge.status,
      dueDate: charge.dueDate,
      remaining: charge.remaining.toNumber(),
    })),
  };
}
