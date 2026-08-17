"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { shareLink } from "@/lib/share";

import {
  invitationLinkAction,
  regenerateInvitationAction,
  revokeInvitationAction,
} from "../../actions";

const ROLE_LABEL = { ADMIN: "Admin", TEACHER: "Profe" } as const;

export type PendingInvitationView = {
  id: string;
  email: string | null;
  role: "ADMIN" | "TEACHER";
  expired: boolean;
  expiresLabel: string;
};

/**
 * Invitaciones sin usar (S7). El token nunca viaja en la lista: "Compartir" lo pide en
 * el momento (patrón comprobante). La vencida no ofrece compartir un link muerto —
 * ofrece regenerarlo (mismo id, token nuevo, vencimiento corrido); revocar borra la
 * fila y el link deja de autorizar en el acto.
 */
export function InvitationsSection({ invitations }: { invitations: PendingInvitationView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (invitations.length === 0) return null;

  const run = (id: string, task: () => Promise<void>) => {
    setBusyId(id);
    startTransition(async () => {
      await task();
      setBusyId(null);
    });
  };

  const share = async (url: string) => {
    const outcome = await shareLink(url, "Invitación al equipo");
    if (outcome === "copied") toast.notify("Link copiado.");
    if (outcome === "failed") toast.error("No se pudo compartir el link. Probá de nuevo.");
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-medium text-text-secondary">Invitaciones pendientes</h2>

      <Card className="flex flex-col gap-0 p-0">
        <ul className="flex flex-col">
          {invitations.map((invitation, index) => (
            <li
              key={invitation.id}
              className={`flex flex-col gap-2 px-4 py-3 ${index > 0 ? "border-t border-border" : ""}`}
            >
              <div className="flex flex-col">
                <span className="truncate font-medium text-text">
                  {invitation.email ?? "Link sin email"}
                </span>
                <span className="text-xs text-text-secondary">
                  {ROLE_LABEL[invitation.role]}
                  {" · "}
                  {invitation.expired ? "Vencida" : `Vence el ${invitation.expiresLabel}`}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {!invitation.expired ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === invitation.id}
                    onClick={() =>
                      run(invitation.id, async () => {
                        const result = await invitationLinkAction(invitation.id);
                        if ("error" in result) {
                          toast.error(result.error);
                          router.refresh();
                          return;
                        }
                        await share(result.url);
                      })
                    }
                  >
                    Compartir link
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyId === invitation.id}
                  onClick={() =>
                    run(invitation.id, async () => {
                      const result = await regenerateInvitationAction(invitation.id);
                      if ("error" in result) {
                        toast.error(result.error);
                        router.refresh();
                        return;
                      }
                      toast.notify("Link nuevo listo. El anterior dejó de funcionar.");
                      router.refresh();
                      await share(result.url);
                    })
                  }
                >
                  Regenerar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === invitation.id}
                  onClick={() =>
                    run(invitation.id, async () => {
                      const result = await revokeInvitationAction(invitation.id);
                      if (result.error) toast.error(result.error);
                      else toast.notify("Invitación revocada. El link dejó de funcionar.");
                      router.refresh();
                    })
                  }
                >
                  Revocar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
