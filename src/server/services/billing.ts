import { Prisma } from "@/generated/prisma/client";
import { addDays, dateInPeriod, isPeriod, periodOf } from "@/lib/dates";

/**
 * El motor de cobranzas: decide QUÉ cuotas corresponden (S3) y CÓMO se imputa la plata
 * (S4), sin tocar la base.
 *
 * Funciones puras (patrón schedule.ts): reciben datos, devuelven resultados. Quién las
 * alimenta y persiste es `server/system/` (los crons, cross-org) o los servicios de
 * datos. La idempotencia NO vive acá: la da el unique `(enrollmentId, period)` de la
 * base — este módulo solo garantiza que con la misma entrada produce la misma salida.
 *
 * Dinero sin flotantes, en dos niveles:
 * - Las funciones de GENERACIÓN (S3) acarrean el monto como tipo opaco `<A>`: no pueden
 *   operar con él.
 * - Las de IMPUTACIÓN (S4) sí hacen aritmética — y son EL ÚNICO lugar del proyecto donde
 *   se suma o resta plata (regla dura de S4): siempre `Prisma.Decimal`, jamás `number`.
 *   Todo otro módulo que necesite operar montos importa los helpers de acá (`money`,
 *   `sumMoney`); a `number` se convierte recién al borde, para mostrar.
 */

export type ChargeStatusValue = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "WAIVED";

export type PlanValue = "MONTHLY" | "DROP_IN";

export type BillingEnrollment<A> = {
  id: string;
  plan: PlanValue;
  /** Precio pactado de la inscripción (RN1: la cuota se genera con ESTE monto). */
  price: A;
  /** Fecha civil de alta ("yyyy-MM-dd"). */
  startDate: string;
  /** Fecha civil de baja, o null si sigue abierta (RN9). */
  endDate: string | null;
};

/** La cuota que corresponde crear. El caller la persiste vía upsert por el unique. */
export type ChargeDraft<A> = {
  enrollmentId: string;
  period: string;
  amount: A;
  currency: string;
  /** Fecha civil de vencimiento: día `dueDay` de la org, clampeado al mes (RN1). */
  dueDate: string;
};

export type BillingOrgConfig = {
  /** Día del mes en que vencen las cuotas de la org (Organization.dueDay). */
  dueDay: number;
  /** Moneda de la org: cada cuota la lleva copiada (RN10). */
  currency: string;
};

/**
 * ¿La inscripción está activa en `period`? (RN1 + RN9)
 *
 * Activa = arrancó a más tardar el último día del período Y no terminó antes del primero.
 * Consecuencias deliberadas, con test cada una:
 * - alta a mitad de mes → el período del alta SÍ genera (cuota completa, RN2);
 * - alta futura → los períodos anteriores al alta no generan (HU4.1: la fecha de alta
 *   define desde qué período);
 * - baja a mitad de mes → el período de la baja TODAVÍA genera; "no se generan cuotas
 *   desde el período SIGUIENTE" (RN9, literal).
 *
 * Los strings comparan bien: "2026-07-15" ≥ "2026-07-01" es orden de calendario.
 */
export function isActiveInPeriod(
  enrollment: { startDate: string; endDate: string | null },
  period: string,
): boolean {
  const first = `${period}-01`;
  const last = dateInPeriod(period, 31);
  return (
    enrollment.startDate <= last && (enrollment.endDate === null || enrollment.endDate >= first)
  );
}

/**
 * RN1 + RN2: las cuotas del período para un lote de inscripciones de UNA org.
 *
 * Solo las MONTHLY activas en el período generan; la clase suelta tiene su cargo único al
 * inscribir (`dropInCharge`) y el cron nunca la toca. `amount` = precio pactado, completo
 * también para el alta a mitad de mes (RN2: el ajuste es manual, editando esa cuota).
 *
 * Determinística y sin efectos: correrla N veces con lo mismo devuelve lo mismo, en el
 * orden de entrada. El "no duplica" lo garantiza el unique de la base en el caller.
 */
export function generateCharges<A>(
  enrollments: BillingEnrollment<A>[],
  period: string,
  orgConfig: BillingOrgConfig,
): ChargeDraft<A>[] {
  // Período malformado = bug del caller, no un caso de negocio: se corta fuerte.
  if (!isPeriod(period)) throw new Error(`generateCharges: período inválido: "${period}"`);

  const dueDate = dateInPeriod(period, orgConfig.dueDay);

  return enrollments
    .filter((e) => e.plan === "MONTHLY" && isActiveInPeriod(e, period))
    .map((e) => ({
      enrollmentId: e.id,
      period,
      amount: e.price,
      currency: orgConfig.currency,
      dueDate,
    }));
}

/**
 * Clase suelta (DROP_IN): UN cargo único al momento de inscribir, con el precio pactado y
 * vencimiento a 7 días del alta. Propuesta RN11 (decisión S3, pendiente de aprobar en el
 * Plan §8): la clase suelta no es una suscripción, así que ni el cron mensual ni el
 * `dueDay` de la org tienen nada que decir acá.
 *
 * `period` = el del alta, porque el unique `(enrollmentId, period)` también protege este
 * cargo: re-inscribir la misma clase suelta no puede duplicar deuda.
 */
export function dropInCharge<A>(
  enrollment: Pick<BillingEnrollment<A>, "id" | "price" | "startDate">,
  orgConfig: Pick<BillingOrgConfig, "currency">,
): ChargeDraft<A> {
  return {
    enrollmentId: enrollment.id,
    period: periodOf(enrollment.startDate),
    amount: enrollment.price,
    currency: orgConfig.currency,
    dueDate: addDays(enrollment.startDate, 7),
  };
}

export type OverdueCandidate = {
  id: string;
  status: ChargeStatusValue;
  /** Fecha civil de vencimiento. */
  dueDate: string;
};

/**
 * RN3, el cron diario: qué cuotas pasan a OVERDUE hoy.
 *
 * Transiciones EXACTAS: solo PENDING y PARTIAL vencen, y solo cuando `hoy > dueDate` —
 * el día del vencimiento la cuota todavía NO está vencida. PAID y WAIVED son estados
 * finales: jamás pasan a vencida, sin importar la fecha. OVERDUE no se re-marca (el cron
 * diario la vuelve a ver cada día).
 *
 * Devuelve ids y no filas mutadas: el caller hace UN updateMany, re-chequeando el estado
 * en el where por si algo cambió entre la lectura y la escritura.
 */
export function markOverdue(charges: OverdueCandidate[], today: string): string[] {
  return charges
    .filter((c) => (c.status === "PENDING" || c.status === "PARTIAL") && today > c.dueDate)
    .map((c) => c.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Imputaciones (S4, RN3 + RN4): la ÚNICA aritmética de dinero del proyecto.
// ─────────────────────────────────────────────────────────────────────────────

export type Money = Prisma.Decimal;

export const ZERO: Money = new Prisma.Decimal(0);

/** Construye un monto desde un literal (input validado o test). */
export function money(value: number | string): Money {
  return new Prisma.Decimal(value);
}

export function sumMoney(values: readonly Money[]): Money {
  return values.reduce((acc: Money, value) => acc.add(value), ZERO);
}

/**
 * RN3, la ÚNICA fuente de verdad del estado de una cuota frente a su plata imputada.
 * Crear, editar o borrar un pago recalcula por acá; RN3 no se reimplementa en ningún
 * otro lado (decisión S4).
 *
 * - WAIVED es un cierre manual: no lo mueve ninguna imputación.
 * - Cubierta (imputado ≥ monto) → PAID. "Una vencida que se paga pasa DIRECTO a
 *   pagada" (RN3): no hay estado intermedio.
 * - Con plata parcial → PARTIAL, salvo que ya esté vencida (hoy > dueDate): una parcial
 *   vencida ES vencida (RN3: "pendiente/parcial pasan a vencida"), el badge no la
 *   disfraza.
 * - Sin plata → PENDING o OVERDUE según el calendario.
 *
 * Es la contracara exacta de `markOverdue`: recomputar hoy y correr el cron hoy dejan
 * el mismo estado.
 */
export function recomputeChargeStatus(
  charge: { amount: Money; status: ChargeStatusValue; dueDate: string },
  allocated: Money,
  today: string,
): ChargeStatusValue {
  if (charge.status === "WAIVED") return "WAIVED";
  if (allocated.greaterThanOrEqualTo(charge.amount)) return "PAID";

  const overdue = today > charge.dueDate;
  if (allocated.greaterThan(ZERO)) return overdue ? "OVERDUE" : "PARTIAL";
  return overdue ? "OVERDUE" : "PENDING";
}

export type PaymentRemainder = {
  paymentId: string;
  /** Lo que a este pago le queda SIN imputar (monto − imputaciones existentes). */
  remaining: Money;
};

export type ChargeRemainder = {
  chargeId: string;
  /** Lo que a esta cuota le falta (monto − imputado por todos los pagos). */
  remaining: Money;
};

export type AllocationDraft = {
  paymentId: string;
  chargeId: string;
  amount: Money;
};

/**
 * RN4: imputación automática, doble-greedy EN EL ORDEN RECIBIDO.
 *
 * El caller manda las cuotas antigua-primero (period, dueDate, id) y los pagos
 * viejo-primero (paidAt, createdAt, id) — este módulo no conoce esos campos, solo
 * respeta el orden. Sirve a los DOS consumos de RN4 con una sola función:
 * - el pago nuevo (un solo pago, remanente = su monto) contra las cuotas impagas;
 * - el crédito existente (varios pagos con remanente) contra las cuotas recién
 *   generadas por el cron.
 *
 * Lo que no entra en ninguna cuota queda como remanente de su pago: ESO es el saldo a
 * favor — un derivado, no una columna. Remanentes ≤ 0 se saltean (defensivo).
 */
export function allocateGreedy(
  payments: readonly PaymentRemainder[],
  charges: readonly ChargeRemainder[],
): AllocationDraft[] {
  const out: AllocationDraft[] = [];

  let chargeIndex = 0;
  let chargeLeft = charges.length > 0 ? charges[0].remaining : ZERO;

  const advance = () => {
    chargeIndex += 1;
    chargeLeft = chargeIndex < charges.length ? charges[chargeIndex].remaining : ZERO;
  };

  for (const payment of payments) {
    let paymentLeft = payment.remaining;

    while (paymentLeft.greaterThan(ZERO) && chargeIndex < charges.length) {
      if (chargeLeft.lessThanOrEqualTo(ZERO)) {
        advance();
        continue;
      }

      const take = Prisma.Decimal.min(paymentLeft, chargeLeft);
      out.push({
        paymentId: payment.paymentId,
        chargeId: charges[chargeIndex].chargeId,
        amount: take,
      });
      paymentLeft = paymentLeft.minus(take);
      chargeLeft = chargeLeft.minus(take);
    }
  }

  return out;
}

/**
 * Las invariantes duras de una imputación EDITADA A MANO (HU4.3: "editable"). Devuelve
 * el mensaje del error o `null` si es válida; el servicio la corre DENTRO de la
 * transacción, con los remanentes leídos ahí mismo.
 */
export function validateAllocations(
  paymentAmount: Money,
  allocations: readonly { chargeId: string; amount: Money }[],
  remainingByCharge: ReadonlyMap<string, Money>,
): string | null {
  const seen = new Set<string>();

  for (const allocation of allocations) {
    if (seen.has(allocation.chargeId)) {
      return "Hay dos imputaciones a la misma cuota.";
    }
    seen.add(allocation.chargeId);

    if (allocation.amount.lessThanOrEqualTo(ZERO)) {
      return "Cada imputación tiene que ser mayor a cero.";
    }

    const remaining = remainingByCharge.get(allocation.chargeId);
    if (remaining === undefined) {
      return "Una de las cuotas no existe o no es de este alumno.";
    }
    if (allocation.amount.greaterThan(remaining)) {
      return "Una imputación supera lo que falta pagar de su cuota.";
    }
  }

  const total = sumMoney(allocations.map((a) => a.amount));
  if (total.greaterThan(paymentAmount)) {
    return "Las imputaciones suman más que el pago.";
  }

  return null;
}
