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
