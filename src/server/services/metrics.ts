import { DEFAULT_TIMEZONE, mondayOf, periodOf, todayInTz } from "@/lib/dates";
import { withOrg } from "@/lib/db";
import { getOrgSettings } from "@/server/organizations";

import { sumMoney, type Money } from "./billing";
import { debtorsForPeriod } from "./charges";
import { weekData, type AgendaOccurrence } from "./sessions";

/**
 * Métricas del dashboard (HU7.1) — con la vara EXISTENTE, nunca una nueva (decisión S6):
 *
 * - "Cobrado del mes" = la suma de IMPUTACIONES a cuotas del período (S4): plata aplicada
 *   a las cuotas de este mes, venga del pago que venga. No "pagos del mes": un pago que
 *   saldó julio no es cobranza de agosto.
 * - "Pendiente" y "deudores" salen de `debtorsForPeriod` — la MISMA llamada que alimenta
 *   la pantalla Cobranzas, así los números cuadran entre pantallas por construcción.
 * - "Clases de hoy" = `weekData` (el motor de S2) filtrado al día: lo que la agenda
 *   muestra hoy, movidas-hacia-hoy y canceladas incluidas.
 *
 * La aritmética es del motor (`sumMoney`, regla S4); acá no se suma plata a mano.
 */

/** Suma de imputaciones, en Decimal. Puro: el test lo coteja contra lo que crea S4. */
export function collectedOfPeriod(allocations: readonly { amount: Money }[]): Money {
  return sumMoney(allocations.map((a) => a.amount));
}

/** Las ocurrencias que se MUESTRAN un día dado, en el orden que ya trae la agenda. Puro. */
export function occurrencesOn<T extends { date: string }>(
  occurrences: readonly T[],
  date: string,
): T[] {
  return occurrences.filter((occurrence) => occurrence.date === date);
}

export type DashboardMetrics = {
  /** El período en curso de la org, "YYYY-MM" (RN10: calculado en SU zona). */
  period: string;
  /** El "hoy" civil de la org. */
  today: string;
  /** Imputado a cuotas del período. Numérico plano, solo para mostrar. */
  collected: number;
  /** Remanentes impagos del período — idéntico al "Por cobrar" de Cobranzas. */
  pending: number;
  /** Cuántas cuotas impagas componen ese pendiente. */
  pendingCharges: number;
  /** Alumnos con deuda del período (los de la pantalla Deudores). */
  debtors: number;
  /** Las clases de hoy, como las muestra la agenda (canceladas incluidas). */
  todayClasses: AgendaOccurrence[];
};

export async function dashboardMetrics(orgId: string): Promise<DashboardMetrics> {
  const settings = await getOrgSettings(orgId);
  const today = todayInTz(settings?.timezone ?? DEFAULT_TIMEZONE);
  const period = periodOf(today);

  const [allocations, debt, week] = await Promise.all([
    withOrg(orgId).paymentAllocation.findMany({
      where: { charge: { period } },
      select: { amount: true },
    }),
    debtorsForPeriod(orgId, period),
    weekData(orgId, mondayOf(today)),
  ]);

  return {
    period,
    today,
    collected: collectedOfPeriod(allocations).toNumber(),
    pending: debt.total,
    pendingCharges: debt.debtors.length,
    debtors: debt.students.length,
    todayClasses: occurrencesOn(week.occurrences, today),
  };
}
