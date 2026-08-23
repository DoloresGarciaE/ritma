import { civilToDb, dbToCivil } from "@/lib/dates";
import { withOrg } from "@/lib/db";

import { type Money } from "./billing";
import { assertRole, can, type Actor } from "./permissions";

/**
 * Acuerdos económicos (S9, HU6.1): el porcentaje de retención de cada profe STAFF, con
 * vigencia. CAMBIAR el porcentaje CREA un registro nuevo (`validFrom`): el historial
 * queda intacto y cada pago liquida con el acuerdo vigente a su fecha (RN6-bis).
 *
 * Owner/admin (Plan §4, va con `settlements:manage`: acuerdos y liquidaciones son la
 * misma llave contable). Solo STAFF: la titular no se liquida a sí misma (decisión S9)
 * y los EXTERNAL llegan con los alquileres (S10).
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
    throw new AgreementRuleError(
      "Los acuerdos de externos (alquiler) llegan en el próximo bloque.",
    );
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
