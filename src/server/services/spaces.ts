import { withOrg, type OrgClient } from "@/lib/db";

import { assertRole, can, type Actor } from "./permissions";

/**
 * Gestión de salones (S8, HU3.1/HU3.4). Como el equipo (S7): estas funciones reciben el
 * `Actor` porque la matriz del Plan §4 las reserva a owner/admin (`spaces:manage`) y la
 * autoridad vive ACÁ — "teacher no crea/edita/desactiva espacios" tiene que ser cierto
 * por API, no por UI (§4.3). Solo STUDIO: en una INDEPENDENT los espacios no existen.
 *
 * La baja es lógica (RN9) y DESASIGNA sus grupos en la misma transacción (decisión S8):
 * un salón que el estudio dejó de usar no puede seguir ocupando el calendario ni la
 * validación de solapamientos. Reactivar no re-asigna nada — la confirmación lo avisa.
 * Los alquileres (S10) no se rozan: sin precios, sin bookings, sin RentalCharge.
 */

export type SpaceListItem = {
  id: string;
  name: string;
  active: boolean;
  /** Grupos ACTIVOS asignados: lo que la baja va a desasignar (la confirmación lo nombra). */
  groupCount: number;
};

/** Regla alcanzable desde la UI (nombre repetido, doble tap): mensaje, no crash. */
export class SpaceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpaceRuleError";
  }
}

/** P2002 sin importar la clase de error (mismo duck-typing que usan los tests). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
  );
}

/** Los espacios existen SOLO en un estudio (Plan §4; regla dura del ticket S8). */
async function assertStudio(org: OrgClient, orgId: string): Promise<void> {
  const organization = await org.organization.findUnique({
    where: { id: orgId },
    select: { type: true },
  });
  if (organization?.type !== "STUDIO") {
    throw new Error("Los salones existen solo en un estudio.");
  }
}

function assertCanManageSpaces(actor: Actor): void {
  if (!can(actor, "spaces:manage")) assertRole(actor, ["OWNER", "ADMIN"]);
}

/** Todos los salones (activos e inactivos) para la pantalla de gestión. */
export async function listSpaces(actor: Actor): Promise<SpaceListItem[]> {
  assertCanManageSpaces(actor);
  const org = withOrg(actor.orgId);
  await assertStudio(org, actor.orgId);

  const rows = await org.space.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      _count: { select: { groups: { where: { active: true } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    active: row.active,
    groupCount: row._count.groups,
  }));
}

export async function createSpace(actor: Actor, name: string): Promise<{ id: string }> {
  assertCanManageSpaces(actor);
  const org = withOrg(actor.orgId);
  await assertStudio(org, actor.orgId);

  try {
    return await org.space.create({
      data: { orgId: actor.orgId, name },
      select: { id: true },
    });
  } catch (error) {
    // El unique [orgId, name]: dos "Salón A" en la misma org no tienen sentido.
    if (isUniqueViolation(error)) {
      throw new SpaceRuleError("Ya existe un salón con ese nombre.");
    }
    throw error;
  }
}

export async function renameSpace(actor: Actor, spaceId: string, name: string): Promise<void> {
  assertCanManageSpaces(actor);

  try {
    await withOrg(actor.orgId).space.update({
      where: { id: spaceId },
      data: { name },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SpaceRuleError("Ya existe un salón con ese nombre.");
    }
    throw error;
  }
}

/**
 * Baja lógica + desasignación en UNA transacción. Devuelve cuántos grupos quedaron
 * "sin salón" (la UI ya lo anticipó en la confirmación con `groupCount`).
 */
export async function deactivateSpace(
  actor: Actor,
  spaceId: string,
): Promise<{ unassigned: number }> {
  assertCanManageSpaces(actor);
  const org = withOrg(actor.orgId);

  return org.$transaction(async (tx) => {
    const scoped = tx as unknown as OrgClient;

    // P2025 si el salón es ajeno: la transacción aborta antes de tocar grupos.
    await scoped.space.update({
      where: { id: spaceId },
      data: { active: false },
      select: { id: true },
    });

    const { count } = await scoped.classGroup.updateMany({
      where: { spaceId },
      data: { spaceId: null },
    });

    return { unassigned: count };
  });
}

/** Reactivar: el salón vuelve al calendario. Sus ex-grupos NO se re-asignan (avisado). */
export async function reactivateSpace(actor: Actor, spaceId: string): Promise<void> {
  assertCanManageSpaces(actor);

  await withOrg(actor.orgId).space.update({
    where: { id: spaceId },
    data: { active: true },
    select: { id: true },
  });
}
