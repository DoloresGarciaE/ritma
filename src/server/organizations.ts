import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";

/**
 * Queries de organización.
 *
 * El `orgId` se recibe SIEMPRE explícito, y sale del `activeOrgId` de la sesión: nunca
 * de la URL ni de un input. En F0.6 llega `withOrg` y absorbe este scoping — hasta
 * entonces, esto es lo único que toca `prisma.*` fuera de `src/lib/`.
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
    db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, type: true },
    }),
);

export const getDisciplines = cache(async (orgId: string) =>
  db.discipline.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  }),
);
