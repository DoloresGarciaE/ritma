"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { UserMembership } from "@/lib/active-org";

import { setActiveOrgAction } from "../actions";

/**
 * Selector de organización (S7 adelantado, decisión de la sesión de demo): solo aparece
 * con más de una membresía. Nombre + tipo + rol, la activa marcada; tocar otra cambia la
 * cookie de preferencia y refresca TODO (el server action revalida el layout entero).
 * Compuesto con primitivos existentes: no es un componente nuevo de la spec.
 */

const TYPE_LABEL = { INDEPENDENT: "Independiente", STUDIO: "Estudio" } as const;
const ROLE_LABEL = { OWNER: "Titular", ADMIN: "Admin", TEACHER: "Profe" } as const;

export function OrgSwitcher({
  memberships,
  activeOrgId,
}: {
  memberships: UserMembership[];
  activeOrgId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();

  const switchTo = (membership: UserMembership) => {
    if (membership.orgId === activeOrgId || switching) return;
    startSwitch(async () => {
      let result: { error?: string };
      try {
        result = await setActiveOrgAction(membership.orgId);
      } catch {
        toast.error("No se pudo cambiar de organización. Probá de nuevo.");
        return;
      }
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.notify(`Ahora estás en ${membership.orgName}.`);
      router.refresh();
    });
  };

  return (
    <Card className="flex flex-col gap-0 p-0">
      <h2 className="px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-text-secondary">
        Organización
      </h2>
      <ul className="flex flex-col">
        {memberships.map((membership, index) => {
          const active = membership.orgId === activeOrgId;
          return (
            <li key={membership.orgId}>
              <button
                type="button"
                onClick={() => switchTo(membership)}
                aria-current={active ? "true" : undefined}
                disabled={switching}
                className={cn(
                  "flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors",
                  "enabled:hover:bg-muted disabled:cursor-default",
                  index > 0 && "border-t border-border",
                )}
              >
                <span className="flex flex-1 flex-col">
                  <span className="font-medium text-text">{membership.orgName}</span>
                  <span className="text-xs text-text-secondary">
                    {TYPE_LABEL[membership.orgType]} · {ROLE_LABEL[membership.role]}
                  </span>
                </span>
                {/* El estado nunca comunica solo con color: el check + aria-current. */}
                {active ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-primary">
                    <Check aria-hidden className="size-4" />
                    Activa
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
