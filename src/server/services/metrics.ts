import { DEFAULT_TIMEZONE, mondayOf, periodOf, todayInTz } from "@/lib/dates";
import { withOrg } from "@/lib/db";
import { getOrgSettings } from "@/server/organizations";

import { sumMoney, type Money } from "./billing";
import { debtorsForPeriod } from "./charges";
import { chargeScopeWhere, type DataScope } from "./permissions";
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

/**
 * El `scope` (S7) baja a las TRES varas de una: para un teacher, "cobrado" son las
 * imputaciones a SUS cuotas del período, pendiente/deudores salen del MISMO
 * `debtorsForPeriod` scoped que su pantalla de Cobranzas, y "clases de hoy" del MISMO
 * `weekData` scoped que su agenda — su Inicio cuadra con sus pantallas por construcción,
 * igual que el de la dueña con las suyas.
 */
export async function dashboardMetrics(orgId: string, scope: DataScope): Promise<DashboardMetrics> {
  const settings = await getOrgSettings(orgId);
  const today = todayInTz(settings?.timezone ?? DEFAULT_TIMEZONE);
  const period = periodOf(today);

  const [allocations, debt, week] = await Promise.all([
    withOrg(orgId).paymentAllocation.findMany({
      where: { charge: { AND: [{ period }, chargeScopeWhere(scope)] } },
      select: { amount: true },
    }),
    debtorsForPeriod(orgId, scope, period),
    weekData(orgId, scope, mondayOf(today)),
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

// ─── Reportes del estudio (S10, HU7.2): ingresos por profe y por disciplina ───────────

export type RevenueRow = {
  key: string;
  label: string;
  /** Numérico plano, solo para mostrar. */
  total: number;
};

export type PeriodRevenue = {
  period: string;
  /** Imputaciones del período agrupadas por el profe del grupo ("Sin profe" incluido). */
  byTeacher: RevenueRow[];
  /** Las mismas imputaciones, por disciplina del grupo. */
  byDiscipline: RevenueRow[];
  /**
   * El total del período — la MISMA vara del dashboard (imputaciones a cuotas del
   * período, S6): los dos cortes suman EXACTO esto por construcción (cada imputación
   * cae en un solo profe y una sola disciplina).
   */
  total: number;
  /** Alquileres del período ya cobrados (RentalCharge PAID, S10) — línea aparte. */
  rentalsCollected: number;
};

/**
 * Ingresos del período (HU7.2, owner/admin — la page asegura el rol): cero queries
 * sueltas en pantallas, cero aritmética fuera del motor (`sumMoney`). El CSV refleja
 * exactamente estas filas.
 */
export async function periodRevenue(orgId: string, period: string): Promise<PeriodRevenue> {
  const org = withOrg(orgId);

  const [allocations, rentals] = await Promise.all([
    org.paymentAllocation.findMany({
      where: { charge: { period } },
      select: {
        amount: true,
        charge: {
          select: {
            enrollment: {
              select: {
                group: {
                  select: {
                    teacherId: true,
                    teacher: { select: { displayName: true } },
                    discipline: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    org.rentalCharge.findMany({ where: { period, status: "PAID" }, select: { amount: true } }),
  ]);

  const teacherBuckets = new Map<string, { label: string; amounts: Money[] }>();
  const disciplineBuckets = new Map<string, { label: string; amounts: Money[] }>();

  for (const allocation of allocations) {
    const group = allocation.charge.enrollment.group;
    const teacherKey = group.teacherId ?? "none";
    const teacherLabel = group.teacher?.displayName ?? "Sin profe";
    const teacher = teacherBuckets.get(teacherKey) ?? { label: teacherLabel, amounts: [] };
    teacher.amounts.push(allocation.amount as Money);
    teacherBuckets.set(teacherKey, teacher);

    const discipline = disciplineBuckets.get(group.discipline.id) ?? {
      label: group.discipline.name,
      amounts: [],
    };
    discipline.amounts.push(allocation.amount as Money);
    disciplineBuckets.set(group.discipline.id, discipline);
  }

  const toRows = (buckets: Map<string, { label: string; amounts: Money[] }>): RevenueRow[] =>
    [...buckets.entries()]
      .map(([key, bucket]) => ({
        key,
        label: bucket.label,
        total: sumMoney(bucket.amounts).toNumber(),
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  return {
    period,
    byTeacher: toRows(teacherBuckets),
    byDiscipline: toRows(disciplineBuckets),
    total: collectedOfPeriod(allocations.map((a) => ({ amount: a.amount as Money }))).toNumber(),
    rentalsCollected: sumMoney(rentals.map((r) => r.amount as Money)).toNumber(),
  };
}
