import { addDays, dateInPeriod, isPeriod, periodOf } from "@/lib/dates";

/**
 * El motor de cobranzas (S3): decide QUÉ cuotas corresponden, sin tocar la base.
 *
 * Funciones puras (patrón schedule.ts): reciben datos, devuelven resultados. Quién las
 * alimenta y persiste es `server/system/` (los crons, cross-org) o los servicios de
 * `enrollments.ts` (la cuota inicial al inscribir). La idempotencia NO vive acá: la da el
 * unique `(enrollmentId, period)` de la base, sobre el que el caller upsertea con
 * `update: {}` — este módulo solo garantiza que con la misma entrada produce exactamente
 * la misma salida.
 *
 * Dinero sin flotantes POR CONSTRUCCIÓN: el monto es un tipo opaco `<A>` (Prisma Decimal
 * en producción) que este módulo acarrea sin poder operar. El día que una regla necesite
 * aritmética de plata (imputaciones, S4), se hace con Decimal, jamás con `number`.
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
