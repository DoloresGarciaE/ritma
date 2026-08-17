import { withOrg, type OrgClient } from "@/lib/db";
import { civilToDb, dbToCivil, periodOf, todayInTz } from "@/lib/dates";

import { dropInCharge, generateCharges, type ChargeDraft } from "./billing";
import { applyStudentCredit } from "./payments";

/**
 * Servicios de inscripciones (HU4.1, RN9).
 *
 * Todo pasa por `withOrg(orgId)` (patrón students.ts/groups.ts), con las dos defensas que
 * el hook no da solo: `studentId` y `groupId` vienen del cliente y se verifican contra la
 * org ANTES de escribir (un FK no distingue tenants), y la cuota inicial se crea ANIDADA
 * con el `orgId` explícito (la escritura anidada no dispara el hook del hijo).
 *
 * La cuota inicial sale del MISMO motor puro que el cron (`services/billing.ts`): una
 * sola fuente de verdad para RN1/RN2/RN11. Decisión S3 registrada: un alta con fecha
 * RETROACTIVA genera solo la cuota del período EN CURSO — los meses anteriores se
 * cobraron fuera de Ritma (caso onboarding) y fabricar esa deuda sorprendería. Si algún
 * día hace falta, será una acción explícita, no un default.
 */

export type EnrollmentListItem = {
  id: string;
  plan: "MONTHLY" | "DROP_IN";
  /** Numérico plano: `Decimal` no cruza a un client component. */
  price: number;
  /** Fechas civiles "yyyy-MM-dd". */
  startDate: string;
  endDate: string | null;
  group: { id: string; name: string };
};

export type GroupEnrollmentItem = {
  id: string;
  plan: "MONTHLY" | "DROP_IN";
  student: { id: string; name: string; active: boolean };
};

export type EnrollmentInput = {
  studentId: string;
  groupId: string;
  plan: "MONTHLY" | "DROP_IN";
  price: number;
  /** Fecha civil de alta. */
  startDate: string;
};

/**
 * Inscripción de a varios: una TANDA comparte grupo, plan, precio y fecha de alta
 * (decisión del ticket). Las excepciones por alumno se hacen con el flujo individual o
 * editando la cuota después (RN2); no existe precio por fila.
 */
export type BulkEnrollmentInput = Omit<EnrollmentInput, "studentId"> & {
  studentIds: string[];
};

/**
 * Regla de negocio que la UI puede provocar legítimamente (doble tap, dos pestañas):
 * se devuelve como error de formulario, no como crash. Las referencias FORJADAS, en
 * cambio, siguen cortando con throw genérico (error boundary), como en groups.ts.
 */
export class EnrollmentRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrollmentRuleError";
  }
}

type EnrollmentRow = {
  id: string;
  plan: "MONTHLY" | "DROP_IN";
  price: { toNumber(): number };
  startDate: Date;
  endDate: Date | null;
  group: { id: string; name: string };
};

function toListItem(row: EnrollmentRow): EnrollmentListItem {
  return {
    id: row.id,
    plan: row.plan,
    price: row.price.toNumber(),
    startDate: dbToCivil(row.startDate),
    endDate: row.endDate ? dbToCivil(row.endDate) : null,
    group: row.group,
  };
}

/** Las inscripciones de la ficha del alumno: abiertas primero, después por alta desc. */
export async function listEnrollmentsForStudent(
  orgId: string,
  studentId: string,
): Promise<EnrollmentListItem[]> {
  const rows = await withOrg(orgId).enrollment.findMany({
    where: { studentId },
    orderBy: [{ endDate: { sort: "asc", nulls: "first" } }, { startDate: "desc" }],
    select: {
      id: true,
      plan: true,
      price: true,
      startDate: true,
      endDate: true,
      group: { select: { id: true, name: true } },
    },
  });

  return rows.map(toListItem);
}

/**
 * Los inscriptos VIGENTES del grupo (para el detalle de sesión, §3.7): inscripción sin
 * baja, o con baja de hoy en adelante. `today` lo decide el caller con la zona de la org.
 */
export async function listActiveEnrollmentsForGroup(
  orgId: string,
  groupId: string,
  today: string,
): Promise<GroupEnrollmentItem[]> {
  const rows = await withOrg(orgId).enrollment.findMany({
    where: {
      groupId,
      OR: [{ endDate: null }, { endDate: { gte: civilToDb(today) } }],
    },
    orderBy: { student: { searchName: "asc" } },
    select: {
      id: true,
      plan: true,
      student: { select: { id: true, name: true, active: true } },
    },
  });

  return rows;
}

/**
 * El roster VIGENTE de toda la org en una sola query, agrupado por grupo: la agenda lo
 * necesita para pintar los inscriptos de cualquier sesión sin una query por grupo.
 * Misma regla de vigencia que `listActiveEnrollmentsForGroup`.
 */
export async function activeRosterByGroup(
  orgId: string,
  today: string,
): Promise<Record<string, GroupEnrollmentItem[]>> {
  const rows = await withOrg(orgId).enrollment.findMany({
    where: { OR: [{ endDate: null }, { endDate: { gte: civilToDb(today) } }] },
    orderBy: { student: { searchName: "asc" } },
    select: {
      id: true,
      plan: true,
      groupId: true,
      student: { select: { id: true, name: true, active: true } },
    },
  });

  const byGroup: Record<string, GroupEnrollmentItem[]> = {};
  for (const { groupId, ...item } of rows) {
    (byGroup[groupId] ??= []).push(item);
  }
  return byGroup;
}

/** `throw` genérico: a este punto solo se llega con una request forjada (groups.ts). */
async function assertRefsInOrg(orgId: string, studentId: string, groupId: string): Promise<void> {
  const org = withOrg(orgId);
  const [student, group] = await Promise.all([
    org.student.findUnique({ where: { id: studentId }, select: { id: true } }),
    org.classGroup.findUnique({ where: { id: groupId }, select: { id: true } }),
  ]);
  if (!student) throw new Error("El alumno no pertenece a esta organización.");
  if (!group) throw new Error("El grupo no pertenece a esta organización.");
}

/**
 * Inscribir (HU4.1): crea la inscripción Y su cuota inicial en UNA escritura anidada
 * (una transacción — no puede quedar inscripción sin su cuota del mes).
 *
 * - MONTHLY: si el período EN CURSO (en la zona de la org) corresponde según RN1/RN2,
 *   nace con esa cuota (completa; el ajuste de RN2 es editarla). Alta futura: sin cuota
 *   hoy — la genera el cron cuando llegue el período (HU4.2).
 * - DROP_IN: SIEMPRE nace con su cargo único a 7 días (propuesta RN11).
 */
export async function createEnrollment(
  orgId: string,
  input: EnrollmentInput,
): Promise<{ id: string }> {
  await assertRefsInOrg(orgId, input.studentId, input.groupId);

  const org = withOrg(orgId);
  const settings = await readBillingSettings(org, orgId);

  const { id, hasCharge } = await enrollOne(org, orgId, input, settings);

  // RN4 (S4): la cuota inicial también es "una cuota generada" — si el alumno tiene
  // saldo a favor, se le aplica acá mismo. Transacción propia y posterior: si fallara,
  // la inscripción y su cuota quedan consistentes y el crédito sigue disponible.
  if (hasCharge) {
    await applyStudentCredit(orgId, input.studentId, todayInTz(settings.timezone));
  }

  return { id };
}

type BillingSettings = { timezone: string; dueDay: number; currency: string };

function readBillingSettings(client: OrgClient, orgId: string): Promise<BillingSettings> {
  return client.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { timezone: true, dueDay: true, currency: true },
  });
}

/**
 * El núcleo de "inscribir a UNO", y la única fuente de verdad: lo comparten la inscripción
 * individual y la tanda (`enrollMany`), que solo lo repite dentro de UNA transacción. Por
 * eso recibe el `client` — puede ser el de `withOrg` o el `tx` de una transacción — y los
 * `settings`, que la tanda lee una sola vez.
 *
 * Deja afuera dos cosas a propósito: la verificación de referencias (la tanda la hace de a
 * lote, antes de abrir la transacción) y el crédito a favor, que corre DESPUÉS y por su
 * cuenta, igual que hoy.
 */
async function enrollOne(
  client: OrgClient,
  orgId: string,
  input: EnrollmentInput,
  settings: BillingSettings,
): Promise<{ id: string; hasCharge: boolean }> {
  // Dos inscripciones ABIERTAS del mismo alumno al mismo grupo serían dos cuotas por mes
  // del mismo concepto. Cerrada y re-abierta sí se puede: se fue y volvió (RN9).
  const open = await client.enrollment.findFirst({
    where: { studentId: input.studentId, groupId: input.groupId, endDate: null },
    select: { id: true },
  });
  if (open) {
    throw new EnrollmentRuleError("Ya está inscripto en este grupo. Dalo de baja primero.");
  }

  const enrollmentData = {
    id: "pending", // lo pisa el default cuid(); el motor puro solo necesita las fechas
    plan: input.plan,
    price: input.price,
    startDate: input.startDate,
    endDate: null,
  };

  let initialCharge: ChargeDraft<number> | null = null;
  if (input.plan === "DROP_IN") {
    initialCharge = dropInCharge(enrollmentData, settings);
  } else {
    const currentPeriod = periodOf(todayInTz(settings.timezone));
    initialCharge =
      generateCharges([enrollmentData], currentPeriod, settings).find(() => true) ?? null;
  }

  const created = await client.enrollment.create({
    data: {
      orgId,
      studentId: input.studentId,
      groupId: input.groupId,
      plan: input.plan,
      price: input.price,
      startDate: civilToDb(input.startDate),
      ...(initialCharge
        ? {
            charges: {
              // orgId EXPLÍCITO: la escritura anidada no pasa por el hook del hijo.
              create: {
                orgId,
                period: initialCharge.period,
                amount: initialCharge.amount,
                currency: initialCharge.currency,
                dueDate: civilToDb(initialCharge.dueDate),
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  return { id: created.id, hasCharge: initialCharge !== null };
}

/**
 * Inscribir a VARIOS alumnos al mismo grupo en una sola operación (ticket de inscripción
 * múltiple). O entran todos o no entra ninguno: las N inscripciones —con su cuota inicial
 * cada una— van dentro de UNA transacción, con el MISMO `enrollOne` del flujo individual.
 * Cero lógica de billing nueva: cada alumno recibe exactamente la cuota que recibiría solo.
 *
 * Lo que puede fallar se detecta ANTES de abrir la transacción y con el lote completo, así
 * el mensaje nombra a todos los que hay que sacar de la selección en vez de ir de a uno.
 */
export async function enrollMany(
  orgId: string,
  input: BulkEnrollmentInput,
): Promise<{ count: number }> {
  // Un id repetido en el payload sería la misma inscripción dos veces: la segunda chocaría
  // contra la primera DENTRO de la transacción y voltearía la tanda entera.
  const studentIds = [...new Set(input.studentIds)];
  if (studentIds.length === 0) {
    throw new EnrollmentRuleError("Elegí al menos un alumno.");
  }

  const org = withOrg(orgId);

  // Referencias contra la org, de a lote: un FK no distingue tenants, y `withOrg` filtra,
  // así que un alumno ajeno simplemente no vuelve en el findMany.
  const [group, students] = await Promise.all([
    org.classGroup.findUnique({ where: { id: input.groupId }, select: { id: true } }),
    org.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true },
    }),
  ]);
  if (!group) throw new Error("El grupo no pertenece a esta organización.");
  if (students.length !== studentIds.length) {
    throw new Error("Alguno de los alumnos no pertenece a esta organización.");
  }

  // Los ya inscriptos no deberían llegar (la UI no los ofrece), pero la UI nunca es la
  // guardia: se revalida acá y la tanda entera se rechaza nombrándolos, antes de escribir.
  const already = await org.enrollment.findMany({
    where: { groupId: input.groupId, studentId: { in: studentIds }, endDate: null },
    select: { studentId: true },
  });
  if (already.length > 0) {
    const taken = new Set(already.map((enrollment) => enrollment.studentId));
    const names = students.filter((s) => taken.has(s.id)).map((s) => s.name);
    throw new EnrollmentRuleError(
      names.length === 1
        ? `${names[0]} ya está en este grupo. Sacalo de la selección y probá de nuevo.`
        : `Ya están en este grupo: ${names.join(", ")}. Sacalos de la selección y probá de nuevo.`,
    );
  }

  const settings = await readBillingSettings(org, orgId);

  const withCharge = await org.$transaction(async (tx) => {
    const scoped = tx as unknown as OrgClient;
    const charged: string[] = [];

    // En serie a propósito: cada `enrollOne` lee el estado que dejó el anterior (la guarda
    // de duplicados), y Prisma no promete orden en un Promise.all dentro de la transacción.
    for (const studentId of studentIds) {
      const { hasCharge } = await enrollOne(scoped, orgId, { ...input, studentId }, settings);
      if (hasCharge) charged.push(studentId);
    }

    return charged;
  });

  // Igual que en el flujo individual: el crédito se aplica DESPUÉS y por alumno, fuera de
  // la transacción de la tanda. Si fallara, las inscripciones y sus cuotas ya son
  // consistentes y el saldo a favor sigue disponible.
  const today = todayInTz(settings.timezone);
  for (const studentId of withCharge) {
    await applyStudentCredit(orgId, studentId, today);
  }

  return { count: studentIds.length };
}

/**
 * Baja de inscripción (RN9): ponerle `endDate`, nunca borrar. Desde el período siguiente
 * el cron no genera más; las cuotas ya generadas PERSISTEN (se pueden exonerar).
 */
export async function endEnrollment(
  orgId: string,
  enrollmentId: string,
  endDate: string,
): Promise<void> {
  const org = withOrg(orgId);

  const enrollment = await org.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { startDate: true },
  });
  if (!enrollment) throw new Error("La inscripción no pertenece a esta organización.");

  if (endDate < dbToCivil(enrollment.startDate)) {
    throw new EnrollmentRuleError("La baja no puede ser anterior al alta.");
  }

  await org.enrollment.update({
    where: { id: enrollmentId },
    data: { endDate: civilToDb(endDate) },
    select: { id: true },
  });
}
