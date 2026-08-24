import { civilToDb, dbToCivil } from "@/lib/dates";
import { withOrg } from "@/lib/db";

import { type Money } from "./billing";
import { assertRole, can, type Actor } from "./permissions";
import { type RentalPeriodValue } from "./rentals";

/**
 * Acuerdos económicos (S9/S10, HU6.1), con vigencia: CAMBIAR las condiciones CREA un
 * registro nuevo (`validFrom`) — el historial queda intacto. STAFF lleva porcentaje
 * (RN6/RN6-bis); EXTERNAL lleva alquiler (RN7: tarifa + modo, S10). La titular no lleva
 * acuerdo.
 *
 * Owner/admin (Plan §4, va con `settlements:manage`: acuerdos, liquidaciones y
 * alquileres son la misma llave contable).
 */

export type AgreementListItem = {
  id: string;
  /** Numérico plano (30 = 30%), solo para mostrar. */
  studioPercent: number;
  /** Fecha civil desde la que rige. */
  validFrom: string;
};

export class AgreementRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgreementRuleError";
  }
}

function assertCanManage(actor: Actor): void {
  if (!can(actor, "settlements:manage")) assertRole(actor, ["OWNER", "ADMIN"]);
}

/** El acuerdo MÁS NUEVO de cada profe (para las filas del equipo): teacherId → acuerdo. */
export async function currentAgreements(actor: Actor): Promise<Record<string, AgreementListItem>> {
  assertCanManage(actor);

  const rows = await withOrg(actor.orgId).agreement.findMany({
    where: { type: "REVENUE_SHARE" },
    orderBy: { validFrom: "asc" },
    select: { id: true, teacherId: true, studioPercent: true, validFrom: true },
  });

  // Orden ascendente: el último que pisa cada teacherId es el más nuevo.
  const byTeacher: Record<string, AgreementListItem> = {};
  for (const row of rows) {
    byTeacher[row.teacherId] = {
      id: row.id,
      studioPercent: (row.studioPercent as Money).toNumber(),
      validFrom: dbToCivil(row.validFrom),
    };
  }
  return byTeacher;
}

/** El historial de acuerdos del profe, vigente primero. */
export async function listAgreements(
  actor: Actor,
  teacherId: string,
): Promise<AgreementListItem[]> {
  assertCanManage(actor);

  const rows = await withOrg(actor.orgId).agreement.findMany({
    where: { teacherId, type: "REVENUE_SHARE" },
    orderBy: { validFrom: "desc" },
    select: { id: true, studioPercent: true, validFrom: true },
  });

  return rows.map((row) => ({
    id: row.id,
    studioPercent: (row.studioPercent as Money).toNumber(),
    validFrom: dbToCivil(row.validFrom),
  }));
}

/**
 * Define (o cambia) el porcentaje: SIEMPRE un registro nuevo con su vigencia. El default
 * no existe a propósito (decisión del ticket: sin acuerdo no hay liquidación posible —
 * la pantalla lo pide, no lo inventa).
 */
export async function setAgreement(
  actor: Actor,
  input: { teacherId: string; studioPercent: number; validFrom: string },
): Promise<{ id: string }> {
  assertCanManage(actor);
  const org = withOrg(actor.orgId);

  const teacher = await org.teacherProfile.findUnique({
    where: { id: input.teacherId },
    select: { kind: true },
  });
  if (!teacher) throw new Error("El perfil no pertenece a esta organización.");
  if (teacher.kind === "OWNER_TEACHER") {
    throw new AgreementRuleError("La titular no se liquida a sí misma: no lleva acuerdo.");
  }
  if (teacher.kind === "EXTERNAL") {
    throw new AgreementRuleError("Un externo lleva acuerdo de alquiler, no de porcentaje.");
  }

  try {
    return await org.agreement.create({
      data: {
        orgId: actor.orgId,
        teacherId: input.teacherId,
        type: "REVENUE_SHARE",
        studioPercent: input.studioPercent,
        validFrom: civilToDb(input.validFrom),
      },
      select: { id: true },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new AgreementRuleError("Ya hay un acuerdo de ese profe con esa misma vigencia.");
    }
    throw error;
  }
}

// ─── Acuerdos RENTAL (S10, RN7): la tarifa de alquiler de un EXTERNAL ─────────────────

export type RentalAgreementItem = {
  id: string;
  /** Numérico plano, solo para mostrar. */
  rentalAmount: number;
  rentalPeriod: RentalPeriodValue;
  /** Fecha civil desde la que rige. */
  validFrom: string;
};

/** El acuerdo de alquiler MÁS NUEVO de cada externo: teacherId → acuerdo. */
export async function currentRentalAgreements(
  actor: Actor,
): Promise<Record<string, RentalAgreementItem>> {
  assertCanManage(actor);

  const rows = await withOrg(actor.orgId).agreement.findMany({
    where: { type: "RENTAL", rentalAmount: { not: null }, rentalPeriod: { not: null } },
    orderBy: { validFrom: "asc" },
    select: { id: true, teacherId: true, rentalAmount: true, rentalPeriod: true, validFrom: true },
  });

  const byTeacher: Record<string, RentalAgreementItem> = {};
  for (const row of rows) {
    byTeacher[row.teacherId] = {
      id: row.id,
      rentalAmount: (row.rentalAmount as Money).toNumber(),
      rentalPeriod: row.rentalPeriod as RentalPeriodValue,
      validFrom: dbToCivil(row.validFrom),
    };
  }
  return byTeacher;
}

/** El historial de alquiler del externo, vigente primero. */
export async function listRentalAgreements(
  actor: Actor,
  teacherId: string,
): Promise<RentalAgreementItem[]> {
  assertCanManage(actor);

  const rows = await withOrg(actor.orgId).agreement.findMany({
    where: { teacherId, type: "RENTAL", rentalAmount: { not: null }, rentalPeriod: { not: null } },
    orderBy: { validFrom: "desc" },
    select: { id: true, rentalAmount: true, rentalPeriod: true, validFrom: true },
  });

  return rows.map((row) => ({
    id: row.id,
    rentalAmount: (row.rentalAmount as Money).toNumber(),
    rentalPeriod: row.rentalPeriod as RentalPeriodValue,
    validFrom: dbToCivil(row.validFrom),
  }));
}

/**
 * Define (o cambia) el alquiler de un EXTERNAL: siempre un registro nuevo con su
 * vigencia (misma mecánica que el porcentaje de S9). El cargo de un período usa el
 * acuerdo vigente al ÚLTIMO día de ese período (decisión S10, sin tramos).
 */
export async function setRentalAgreement(
  actor: Actor,
  input: {
    teacherId: string;
    rentalAmount: number;
    rentalPeriod: RentalPeriodValue;
    validFrom: string;
  },
): Promise<{ id: string }> {
  assertCanManage(actor);
  const org = withOrg(actor.orgId);

  const teacher = await org.teacherProfile.findUnique({
    where: { id: input.teacherId },
    select: { kind: true },
  });
  if (!teacher) throw new Error("El perfil no pertenece a esta organización.");
  if (teacher.kind !== "EXTERNAL") {
    throw new AgreementRuleError("El alquiler es para profes externos; staff lleva porcentaje.");
  }

  try {
    return await org.agreement.create({
      data: {
        orgId: actor.orgId,
        teacherId: input.teacherId,
        type: "RENTAL",
        rentalAmount: input.rentalAmount,
        rentalPeriod: input.rentalPeriod,
        validFrom: civilToDb(input.validFrom),
      },
      select: { id: true },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new AgreementRuleError("Ya hay un acuerdo de ese profe con esa misma vigencia.");
    }
    throw error;
  }
}
