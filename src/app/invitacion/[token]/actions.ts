"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_ORG_COOKIE } from "@/lib/active-org";
import { requireSession } from "@/lib/auth";
import { getInvitationByToken } from "@/server/public/invitations";
import { acceptInvitation, TeamRuleError } from "@/server/services/team";

/**
 * Acepta la invitación (S7, HU1.3). Exige sesión; el `orgId` sale de la PROPIA
 * invitación (puerta pública por token), jamás del cliente, y el servicio revalida el
 * token adentro de su transacción. Al aceptar: la org nueva queda ACTIVA (cookie del
 * selector, mismas opciones que `setActiveOrgAction`) y se purga el router cache — el
 * aterrizaje es el dashboard del equipo al que se acaba de entrar.
 */
export async function acceptInvitationAction(token: string): Promise<{ error: string }> {
  const session = await requireSession();

  const invitation = await getInvitationByToken(token);
  if (!invitation) return { error: "Esta invitación no existe o fue revocada." };
  if (invitation.kind === "used") return { error: "Esta invitación ya fue usada." };
  if (invitation.kind === "expired") return { error: "Esta invitación venció. Pedí una nueva." };

  try {
    await acceptInvitation(
      { id: session.userId, name: session.name },
      invitation.orgId,
      token,
    );
  } catch (error) {
    if (error instanceof TeamRuleError) return { error: error.message };
    throw error;
  }

  (await cookies()).set(ACTIVE_ORG_COOKIE, invitation.orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  redirect("/");
}
