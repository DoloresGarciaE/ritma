import { Prisma } from "@/generated/prisma/client";
import { withOrg } from "@/lib/db";
import { dbToCivil } from "@/lib/dates";

import type { ChargeStatusValue } from "./billing";

/**
 * Servicios de cuotas (RN2, RN3): el estado de cuenta de la ficha, la lista de deudores
 * por período, y las dos mutaciones manuales — editar el monto (RN2) y exonerar (RN3).
 *
 * Todo por `withOrg(orgId)`. El total adeudado se suma con `Prisma.Decimal`, jamás con
 * `number`: la aritmética de plata no toca floats (decisión S3); a `number` se convierte
 * recién al borde, para mostrar.
 *
 * Los QUIÉN PUEDEN (owner/admin para editar y exonerar, Plan §4) se resuelven en las
 * actions con `requireRole` — acá solo viven las reglas de QUÉ estados lo permiten.
 */

export type ChargeListItem = {
  id: string;
  period: string;
  /** Numérico plano, solo para mostrar: la suma ya se hizo en Decimal. */
  amount: number;
  currency: string;
  /** Fecha civil "yyyy-MM-dd". */
  dueDate: string;
  status: ChargeStatusValue;
  group: { id: string; name: string };
  plan: "MONTHLY" | "DROP_IN";
};

export type DebtorRow = {
  chargeId: string;
  amount: number;
  status: ChargeStatusValue;
  dueDate: string;
  period: string;
  student: { id: string; name: string };
  group: { id: string; name: string };
};

/** Estados que cuentan como deuda del período (S4 sumará los pagos parciales). */
const OWING: ChargeStatusValue[] = ["PENDING", "PARTIAL", "OVERDUE"];

/** Igual que EnrollmentRuleError: mal estado ≠ request forjada — se muestra, no revienta. */
export class ChargeRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChargeRuleError";
  }
}

const CHARGE_SELECT = {
  id: true,
  period: true,
  amount: true,
  currency: true,
  dueDate: true,
  status: true,
  enrollment: {
    select: { plan: true, group: { select: { id: true, name: true } } },
  },
} as const;

type ChargeRow = {
  id: string;
  period: string;
  amount: { toNumber(): number };
  currency: string;
  dueDate: Date;
  status: ChargeStatusValue;
  enrollment: { plan: "MONTHLY" | "DROP_IN"; group: { id: string; name: string } };
};

function toListItem(row: ChargeRow): ChargeListItem {
  return {
    id: row.id,
    period: row.period,
    amount: row.amount.toNumber(),
    currency: row.currency,
    dueDate: dbToCivil(row.dueDate),
    status: row.status,
    group: row.enrollment.group,
    plan: row.enrollment.plan,
  };
}

/**
 * El estado de cuenta de la ficha (HU4.1 + §3.3): TODAS las cuotas del alumno, las más
 * nuevas primero. No filtra por estado: el historial pagado/exonerado es parte de la
 * confianza (RN9).
 */
export async function listChargesForStudent(
  orgId: string,
  studentId: string,
): Promise<ChargeListItem[]> {
  const rows = await withOrg(orgId).charge.findMany({
    where: { enrollment: { studentId } },
    orderBy: [{ period: "desc" }, { dueDate: "desc" }, { id: "asc" }],
    select: CHARGE_SELECT,
  });

  return rows.map(toListItem);
}

/**
 * Deudores del período (pantalla Cobranzas): las cuotas impagas (PENDING/PARTIAL/OVERDUE)
 * de ese período, con alumno y grupo, más el TOTAL adeudado — sumado en Decimal.
 *
 * Una fila por CUOTA, no por alumno: un alumno en dos grupos debe dos conceptos, cada uno
 * con su estado y su monto exactos (el agregado por alumno llega con los pagos, S4).
 */
export async function debtorsForPeriod(
  orgId: string,
  period: string,
  options: { groupId?: string } = {},
): Promise<{ total: number; debtors: DebtorRow[] }> {
  const rows = await withOrg(orgId).charge.findMany({
    where: {
      period,
      status: { in: OWING },
      enrollment: options.groupId ? { groupId: options.groupId } : undefined,
    },
    orderBy: [{ enrollment: { student: { searchName: "asc" } } }, { id: "asc" }],
    select: {
      id: true,
      amount: true,
      status: true,
      dueDate: true,
      period: true,
      enrollment: {
        select: {
          student: { select: { id: true, name: true } },
          group: { select: { id: true, name: true } },
        },
      },
    },
  });

  const total = rows.reduce((acc, row) => acc.add(row.amount), new Prisma.Decimal(0));

  return {
    total: total.toNumber(),
    debtors: rows.map((row) => ({
      chargeId: row.id,
      amount: row.amount.toNumber(),
      status: row.status,
      dueDate: dbToCivil(row.dueDate),
      period: row.period,
      student: row.enrollment.student,
      group: row.enrollment.group,
    })),
  };
}

/**
 * RN2: el ajuste manual del monto (el caso canónico: la primera cuota de un alta a mitad
 * de mes). Solo mientras la cuota está impaga y sin pagos aplicados: PENDING u OVERDUE.
 * PARTIAL/PAID quedan para S4 (tocar el monto con imputaciones encima es otra historia);
 * WAIVED es un cierre.
 */
export async function updateChargeAmount(
  orgId: string,
  chargeId: string,
  amount: number,
): Promise<void> {
  const org = withOrg(orgId);

  const charge = await org.charge.findUnique({
    where: { id: chargeId },
    select: { status: true },
  });
  if (!charge) throw new Error("La cuota no pertenece a esta organización.");

  if (charge.status !== "PENDING" && charge.status !== "OVERDUE") {
    throw new ChargeRuleError("Solo se puede editar el monto de una cuota impaga.");
  }

  await org.charge.update({
    where: { id: chargeId },
    data: { amount },
    select: { id: true },
  });
}

/**
 * RN3: exonerar (beca, canje) — cierre manual SIN pago. Solo owner/admin (lo exige la
 * action con requireRole). Una cuota pagada no se exonera; una exonerada ya lo está.
 */
export async function waiveCharge(orgId: string, chargeId: string): Promise<void> {
  const org = withOrg(orgId);

  const charge = await org.charge.findUnique({
    where: { id: chargeId },
    select: { status: true },
  });
  if (!charge) throw new Error("La cuota no pertenece a esta organización.");

  if (!OWING.includes(charge.status)) {
    throw new ChargeRuleError(
      charge.status === "WAIVED"
        ? "Esta cuota ya está exonerada."
        : "Una cuota pagada no se exonera.",
    );
  }

  await org.charge.update({
    where: { id: chargeId },
    data: { status: "WAIVED" },
    select: { id: true },
  });
}
