"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { ACTIVE_ORG_COOKIE, listMembershipsForUser } from "@/lib/active-org";
import { requireSession } from "@/lib/auth";

/**
 * Cambia la organización activa (selector de "Más", adelanto mínimo de S7).
 *
 * La preferencia es una cookie; la GUARDIA es doble: acá se valida la membresía antes
 * de setearla, y `customSession` la revalida en CADA request (una cookie forjada apunta
 * a una org sin membresía → se ignora y cae a la primera). El `revalidatePath` de layout
 * purga el router cache del cliente — sin él, quedaría data de la org anterior servida
 * desde el cache (la misma lección del wizard de F0.5).
 */
export async function setActiveOrgAction(orgId: string): Promise<{ error?: string }> {
  const session = await requireSession();

  const memberships = await listMembershipsForUser(session.userId);
  if (!memberships.some((membership) => membership.orgId === orgId)) {
    return { error: "No sos miembro de esa organización." };
  }

  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return {};
}
