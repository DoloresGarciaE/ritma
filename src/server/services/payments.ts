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
import {
  chargeScopeWhere,
  paymentScopeWhere,
  studentScopeWhere,
  type DataScope,
} from "./permissions";

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
  /**
   * QUÉ profe lo cobró en mano (S9, RN5/RN6): el C de su liquidación toma el pago
   * completo. Solo tiene sentido con receivedBy=TEACHER; para un actor TEACHER se
   * fuerza su propio perfil (auto-atribución); null = "sin atribuir", que Liquidaciones
   * CANTA en su balde (decisión S9 — sin magia).
   */
  receivedById?: string | null;
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

/**
 * Cuotas abiertas del alumno, antigua-primero (RN4), con su remanente en Decimal.
 *
 * El `scope` (S7, decisión de la sesión con Dolores — aclaración de RN4): cuando un
 * TEACHER registra un pago, la imputación automática Y la manual corren SOLO sobre las
 * cuotas de SUS grupos — antigua-primero dentro de ese subconjunto. El crédito nocturno
 * del cron (`applyStudentCredit`) sigue siendo org-completo: es plata del alumno con la
 * organización, y ahí no hay actor.
 */
async function openChargesOf(client: OrgClient, scope: DataScope, studentId: string) {
  const rows = await client.charge.findMany({
    where: {
      status: { in: OPEN },
      AND: [{ enrollment: { studentId } }, chargeScopeWhere(scope)],
    },
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

type ChargeForRecompute = {
  id: string;
  amount: Money;
  status: ChargeStatusValue;
  /** Fecha civil. */
  dueDate: string;
  /** El total imputado DESPUÉS de la escritura de esta transacción. */
  newAllocated: Money;
};

/**
 * Recalcula el estado de las cuotas tocadas por LA ÚNICA fuente de verdad
 * (`recomputeChargeStatus`, RN3) y escribe solo los que cambian.
 *
 * Recibe los datos YA LEÍDOS por el caller dentro de la transacción — cero re-lecturas:
 * una transacción interactiva contra Neon paga cada roundtrip en latencia real, y la
 * versión que re-leía cuota por cuota se pasaba del timeout con un pago multi-cuota.
 */
async function applyRecomputedStatuses(
  client: OrgClient,
  charges: ChargeForRecompute[],
  today: string,
): Promise<void> {
  for (const charge of charges) {
    const status = recomputeChargeStatus(
      { amount: charge.amount, status: charge.status, dueDate: charge.dueDate },
      charge.newAllocated,
      today,
    );

    if (status !== charge.status) {
      await client.charge.update({
        where: { id: charge.id },
        data: { status },
        select: { id: true },
      });
    }
  }
}

/** Suma los borradores de imputación por cuota (varios pagos pueden tocar la misma). */
function draftTotalsByCharge(drafts: readonly { chargeId: string; amount: Money }[]) {
  const totals = new Map<string, Money>();
  for (const draft of drafts) {
    totals.set(draft.chargeId, (totals.get(draft.chargeId) ?? ZERO).add(draft.amount));
  }
  return totals;
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
export async function createPayment(
  orgId: string,
  scope: DataScope,
  input: PaymentInput,
): Promise<{ id: string; receiptToken: string }> {
  const org = withOrg(orgId);

  return org.$transaction(
    async (tx) => {
      const scoped = tx as unknown as OrgClient;

      // Contra la org Y contra el scope (S7): un teacher registra pagos de SUS alumnos.
      const student = await scoped.student.findUnique({
        where: { id: input.studentId, AND: [studentScopeWhere(scope)] },
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

      // receivedById (S9): solo con "lo recibió un profe". Un actor TEACHER se atribuye
      // a SÍ MISMO (lo que diga el cliente no cuenta); owner/admin eligen el perfil, que
      // se verifica contra la org (cross-ref, patrón F0.6). Null = sin atribuir, cantado.
      const receivedBy = input.receivedBy ?? "STUDIO";
      let receivedById: string | null = null;
      if (receivedBy === "TEACHER") {
        receivedById =
          scope.kind === "teacher" ? scope.teacherProfileId : (input.receivedById ?? null);
        if (receivedById) {
          const profile = await scoped.teacherProfile.findUnique({
            where: { id: receivedById },
            select: { id: true },
          });
          if (!profile) throw new Error("El perfil de profe no pertenece a esta organización.");
        }
      }

      const open = await openChargesOf(scoped, scope, input.studentId);
      const openWithRemainder = open.filter((charge) => charge.remaining.greaterThan(ZERO));

      let drafts: { chargeId: string; amount: Money }[];
      if (input.allocations) {
        const manual = input.allocations.map((allocation) => ({
          chargeId: allocation.chargeId,
          amount: money(allocation.amount),
        }));
        // El mapa de remanentes sale de las cuotas DEL ALUMNO (y del SCOPE del actor,
        // S7): una cuota ajena — de otra org, otro alumno u otro profe — no está y el
        // motor la rechaza.
        const remainingByCharge = new Map(
          openWithRemainder.map((charge) => [charge.id, charge.remaining]),
        );
        const error = validateAllocations(amount, manual, remainingByCharge);
        if (error) throw new PaymentRuleError(error);
        drafts = manual;
      } else {
        drafts = allocateGreedy(
          [{ paymentId: "nuevo", remaining: amount }],
          openWithRemainder.map((charge) => ({
            chargeId: charge.id,
            remaining: charge.remaining,
          })),
        ).map((draft) => ({ chargeId: draft.chargeId, amount: draft.amount }));
      }

      const payment = await scoped.payment.create({
        data: {
          orgId,
          studentId: input.studentId,
          amount,
          currency: settings.currency,
          method: input.method,
          receivedBy,
          receivedById,
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
        // El token vuelve con el alta: el toast §3.9 comparte SIN otro round-trip — un
        // await antes de navigator.share se comería la activación del tap (iOS).
        select: { id: true, receiptToken: true },
      });

      // El recompute reusa lo YA leído: imputado nuevo = (monto − remanente) + borrador.
      const draftTotals = draftTotalsByCharge(drafts);
      await applyRecomputedStatuses(
        scoped,
        open
          .filter((charge) => draftTotals.has(charge.id))
          .map((charge) => ({
            id: charge.id,
            amount: charge.amount,
            status: charge.status,
            dueDate: charge.dueDate,
            newAllocated: charge.amount.minus(charge.remaining).add(draftTotals.get(charge.id)!),
          })),
        today,
      );

      return payment;
    },
    // Neon queda a un océano del dev local: el default de 5 s se queda corto con la
    // latencia real. Los roundtrips ya están minimizados; esto es defensa, no excusa.
    { timeout: 15000 },
  );
}

/**
 * Eliminar un pago (propuesta RN12): solo pagos SIN liquidación — en Fase 1, todos; la
 * inmutabilidad llega con el cierre de liquidaciones (RN6, S9). La transacción borra el
 * pago (las imputaciones caen por cascada) y recalcula los estados: las cuotas vuelven
 * solas a PENDING/PARTIAL/OVERDUE según su calendario.
 */
export async function deletePayment(
  orgId: string,
  scope: DataScope,
  paymentId: string,
): Promise<{ attachmentKey: string | null }> {
  const org = withOrg(orgId);

  return org.$transaction(
    async (tx) => {
      const scoped = tx as unknown as OrgClient;

      // El scope (S7, decisión de la sesión): un teacher elimina pagos de SUS alumnos —
      // es el deshacer de registrar. La inmutabilidad REAL llegó con S9 (RN12 completa):
      // un pago vinculado a una liquidación cerrada no se toca — borrar sus imputaciones
      // reescribiría números ya congelados.
      const payment = await scoped.payment.findUnique({
        where: { id: paymentId, AND: [paymentScopeWhere(scope)] },
        select: {
          id: true,
          attachmentKey: true,
          settlement: { select: { period: true } },
          allocations: { select: { chargeId: true } },
        },
      });
      if (!payment) throw new Error("El pago no pertenece a esta organización.");
      if (payment.settlement) {
        throw new PaymentRuleError(
          `Este pago está en la liquidación cerrada de ${payment.settlement.period}: no se puede eliminar.`,
        );
      }

      const settings = await scoped.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { timezone: true },
      });

      // Las cuotas tocadas, leídas UNA vez ANTES del delete; el imputado nuevo excluye
      // las imputaciones de ESTE pago (que se van por cascada).
      const touchedIds = payment.allocations.map((allocation) => allocation.chargeId);
      const touched =
        touchedIds.length > 0
          ? await scoped.charge.findMany({
              where: { id: { in: touchedIds } },
              select: {
                id: true,
                amount: true,
                status: true,
                dueDate: true,
                allocations: { select: { paymentId: true, amount: true } },
              },
            })
          : [];

      await scoped.payment.delete({ where: { id: paymentId }, select: { id: true } });

      await applyRecomputedStatuses(
        scoped,
        touched.map((charge) => ({
          id: charge.id,
          amount: charge.amount as Money,
          status: charge.status as ChargeStatusValue,
          dueDate: dbToCivil(charge.dueDate),
          newAllocated: sumMoney(
            charge.allocations
              .filter((allocation) => allocation.paymentId !== paymentId)
              .map((allocation) => allocation.amount),
          ),
        })),
        todayInTz(settings.timezone),
      );

      // El caller borra el objeto de R2 (best-effort) DESPUÉS de que la base confirmó.
      return { attachmentKey: payment.attachmentKey };
    },
    { timeout: 15000 },
  );
}

/** El adjunto del pago (lectura chica para las actions de R2). `null` si es ajeno. */
export async function getPaymentAttachment(
  orgId: string,
  scope: DataScope,
  paymentId: string,
): Promise<{ attachmentKey: string | null } | null> {
  return withOrg(orgId).payment.findUnique({
    where: { id: paymentId, AND: [paymentScopeWhere(scope)] },
    select: { attachmentKey: true },
  });
}

/** El token del link público del pago (para compartir). `null` si el pago es ajeno. */
export async function getReceiptToken(
  orgId: string,
  scope: DataScope,
  paymentId: string,
): Promise<{ receiptToken: string } | null> {
  return withOrg(orgId).payment.findUnique({
    where: { id: paymentId, AND: [paymentScopeWhere(scope)] },
    select: { receiptToken: true },
  });
}

/**
 * Revoca el link público del comprobante ROTANDO el token (S5): el link compartido muere
 * en el acto y nace uno nuevo listo para compartir. No hay estado "revocado": la
 * autorización es el token, y un token que ya no existe no autoriza nada.
 * P2025 si el pago es ajeno.
 */
export async function rotateReceiptToken(
  orgId: string,
  scope: DataScope,
  paymentId: string,
): Promise<{ receiptToken: string }> {
  return withOrg(orgId).payment.update({
    where: { id: paymentId, AND: [paymentScopeWhere(scope)] },
    data: { receiptToken: generateReceiptToken() },
    select: { receiptToken: true },
  });
}

/** Fija (o limpia) el pointer del comprobante. P2025 si el pago es ajeno. */
export async function setPaymentAttachment(
  orgId: string,
  scope: DataScope,
  paymentId: string,
  attachmentKey: string | null,
): Promise<void> {
  await withOrg(orgId).payment.update({
    where: { id: paymentId, AND: [paymentScopeWhere(scope)] },
    data: { attachmentKey },
    select: { id: true },
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

  return org.$transaction(
    async (tx) => {
      const scoped = tx as unknown as OrgClient;

      const remainders = await paymentRemaindersOf(scoped, studentId);
      if (remainders.length === 0) return { applied: 0 };

      // Scope "all" a propósito: acá no hay actor (cron / alta) y el crédito del alumno
      // es con la ORGANIZACIÓN — RN4 org-completo, antigua-primero.
      const open = await openChargesOf(scoped, { kind: "all" }, studentId);
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

      const draftTotals = draftTotalsByCharge(drafts);
      await applyRecomputedStatuses(
        scoped,
        open
          .filter((charge) => draftTotals.has(charge.id))
          .map((charge) => ({
            id: charge.id,
            amount: charge.amount,
            status: charge.status,
            dueDate: charge.dueDate,
            newAllocated: charge.amount.minus(charge.remaining).add(draftTotals.get(charge.id)!),
          })),
        today,
      );

      return { applied: drafts.length };
    },
    { timeout: 15000 },
  );
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

/**
 * Los pagos del alumno, más nuevos primero, con sus imputaciones legibles.
 *
 * El pago es dato del ALUMNO (plata suya con la org), no de un grupo: si el alumno está
 * en el scope del actor (S7), se ven TODOS sus pagos — en un alumno compartido, ambos
 * profes ven el mismo estado de cuenta. Lo que sí queda scoped por profe son las cuotas
 * (listChargesForStudent) y las imputaciones que cada uno registra.
 */
export async function listPaymentsForStudent(
  orgId: string,
  scope: DataScope,
  studentId: string,
): Promise<PaymentListItem[]> {
  const rows = await withOrg(orgId).payment.findMany({
    where: { studentId, AND: [paymentScopeWhere(scope)] },
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
 *
 * Con scope de teacher (S7): sus cuotas del alumno (la deuda que el sheet pre-carga es
 * la deuda CON ÉL); el crédito es del alumno con la org (derivado, el mismo para todos).
 */
export async function paymentContext(
  orgId: string,
  scope: DataScope,
  studentId: string,
): Promise<PaymentContext> {
  const org = withOrg(orgId);

  const inScope = await org.student.findUnique({
    where: { id: studentId, AND: [studentScopeWhere(scope)] },
    select: { id: true },
  });
  if (!inScope) throw new Error("El alumno no pertenece a esta organización.");

  const [open, remainders] = await Promise.all([
    openChargesOf(org, scope, studentId),
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
