"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { TeamMember } from "@/server/services/team";

import { revokeMemberAction } from "../../actions";

const ROLE_LABEL = { OWNER: "Titular", ADMIN: "Admin", TEACHER: "Profe" } as const;

/**
 * Los miembros del equipo (S7). La titular no se revoca y nadie se revoca a sí mismo:
 * esas filas no muestran la acción (§4.3) — y el servicio lo vuelve a impedir igual.
 * La confirmación nombra a la persona y la consecuencia (§3.8): no entra más, su
 * historial queda.
 */
export function TeamSection({
  members,
  selfUserId,
}: {
  members: TeamMember[];
  selfUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<TeamMember | null>(null);
  const [revoking, startRevoke] = useTransition();

  const handleRevoke = () => {
    if (!target) return;
    startRevoke(async () => {
      const result = await revokeMemberAction(target.userId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.notify(`Revocaste el acceso de ${target.name}. Su historial queda como está.`);
        router.refresh();
      }
      setTarget(null);
    });
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-medium text-text-secondary">Equipo</h2>

      <Card className="flex flex-col gap-0 p-0">
        <ul className="flex flex-col">
          {members.map((member, index) => (
            <li
              key={member.userId}
              className={`flex min-h-16 items-center gap-3 px-4 py-3 ${
                index > 0 ? "border-t border-border" : ""
              }`}
            >
              <Avatar name={member.name} size="md" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-text">{member.name}</span>
                <span className="truncate text-xs text-text-secondary">
                  {ROLE_LABEL[member.role]}
                  {member.teacher
                    ? ` · ${
                        member.teacher.groupCount === 1
                          ? "1 grupo a cargo"
                          : `${member.teacher.groupCount} grupos a cargo`
                      }`
                    : ""}
                  {" · "}
                  {member.email}
                </span>
              </div>
              {member.role !== "OWNER" && member.userId !== selfUserId ? (
                <Button variant="ghost" size="sm" onClick={() => setTarget(member)}>
                  Revocar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>¿Revocar el acceso de {target?.name}?</DialogTitle>
          <DialogDescription>
            No va a poder entrar más al estudio. Sus grupos y su historial quedan como están, y
            podés volver a invitarle cuando quieras.
          </DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={revoking}
              onClick={handleRevoke}
            >
              Revocar acceso
            </Button>
            <DialogClose
              render={
                <Button variant="ghost" size="lg" className="w-full">
                  Volver
                </Button>
              }
            />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
