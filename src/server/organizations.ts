import "server-only";

import { cache } from "react";

import { withOrg } from "@/lib/db";

/**
 * Queries de organización, todas acotadas con `withOrg` (F0.6): el `orgId` se recibe
 * explícito —sale del `activeOrgId` de la sesión, nunca de la URL ni de un input— y el
 * cliente lo inyecta en cada query. La guardia de membresía la hace `requireMember` en el
 * layout de `(app)`; acá el aislamiento es defensa en profundidad: con un `orgId` ajeno,
 * estas queries no devuelven nada.
 */

export type ShellOrganization = {
  id: string;
  name: string;
  type: "INDEPENDENT" | "STUDIO";
};

/**
 * La organización que el shell necesita para dibujarse. Va con `cache()` de React porque
 * el layout y la página la piden en el mismo render: dedupe por request, sin staleness.
 */
export const getShellOrganization = cache(
  async (orgId: string): Promise<ShellOrganization | null> =>
    withOrg(orgId).organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, type: true },
    }),
);

export const getDisciplines = cache(async (orgId: string) =>
  withOrg(orgId).discipline.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  }),
);

/**
 * Config de la org que la agenda y los recordatorios necesitan: la zona define qué día
 * es "hoy" (RN10); alias y plantilla arman el recordatorio (S5).
 */
export const getOrgSettings = cache(async (orgId: string) =>
  withOrg(orgId).organization.findUnique({
    where: { id: orgId },
    select: { timezone: true, paymentAlias: true, reminderTemplate: true },
  }),
);

/**
 * Los perfiles docentes de la org para el selector "Profe a cargo" (S7): solo los
 * VINCULADOS a una cuenta — un perfil desvinculado es historia, no una opción de
 * asignación. Los grupos que ya apuntan a uno desvinculado lo siguen mostrando por
 * nombre (la relación del grupo, no esta lista). Lo consumen páginas de owner/admin.
 */
export const listTeacherOptions = cache(async (orgId: string) =>
  withOrg(orgId).teacherProfile.findMany({
    where: { membershipUserId: { not: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, displayName: true },
  }),
);

/**
 * Los salones ACTIVOS de la org (S8): las columnas del calendario y las opciones del
 * selector "Salón" del form de grupo. Lo lee cualquier miembro — los salones son la
 * estructura física del estudio (decisión de sesión S8: un teacher ve el marco completo
 * con SUS clases adentro); gestionarlos sigue siendo de owner/admin (services/spaces.ts).
 */
export const listActiveSpaces = cache(async (orgId: string) =>
  withOrg(orgId).space.findMany({
    where: { active: true },
    // Orden de creación; el desempate es por NOMBRE — los salones heredados por la
    // migración S8 comparten el timestamp y el id (uuid) los barajaría.
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  }),
);
