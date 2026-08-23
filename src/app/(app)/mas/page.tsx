import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight, Settings } from "lucide-react";

import { Card } from "@/components/ui/card";
import { listMembershipsForUser } from "@/lib/active-org";
import { requireSession } from "@/lib/auth";
import { requireScopedMember } from "@/server/authz";
import { getShellOrganization } from "@/server/organizations";
import { can } from "@/server/services/permissions";

import { AppBar } from "../_components/app-bar";
import { LogoutButton } from "../_components/logout-button";
import { OrgSwitcher } from "./_components/org-switcher";

export const metadata: Metadata = {
  title: "Más",
};

/**
 * "Más" agrupa estudio y ajustes (Plan §11). En una organización independiente no hay nada
 * de estudio: ni el link, ni la palabra. Ajustes es configuración de la org (Plan §4,
 * Componentes §4.3 — lo que un rol no puede hacer, no se muestra); Estudio, desde S9,
 * también lo ve una profe STAFF — su puerta a "Mis liquidaciones" (HU6.4), con el hint
 * ajustado a lo que hay del otro lado. Con más de una membresía, arriba va el selector
 * de organización; con una sola, no aparece.
 */
export default async function MasPage() {
  const session = await requireSession();
  const [org, memberships, { actor, scope }] = await Promise.all([
    getShellOrganization(session.activeOrgId!),
    listMembershipsForUser(session.userId),
    requireScopedMember(session.activeOrgId!),
  ]);

  const manages = can(actor, "org:configure");
  const isTeacherWithProfile = scope.kind === "teacher" && scope.teacherProfileId !== null;

  const links = [
    ...(org?.type === "STUDIO" && (manages || isTeacherWithProfile)
      ? [
          {
            href: "/estudio",
            icon: Building2,
            label: "Estudio",
            hint: manages ? "Equipo, salones y liquidaciones" : "Tus liquidaciones",
          },
        ]
      : []),
    ...(manages
      ? [
          {
            href: "/ajustes",
            icon: Settings,
            label: "Ajustes",
            hint: "Moneda, vencimientos, disciplinas",
          },
        ]
      : []),
  ];

  return (
    <>
      <AppBar title="Más" />

      <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
        {memberships.length > 1 ? (
          <OrgSwitcher memberships={memberships} activeOrgId={session.activeOrgId!} />
        ) : null}

        {links.length === 0 ? null : (
          <Card className="flex flex-col gap-0 p-0">
            <ul className="flex flex-col">
              {links.map((link, index) => {
                const Icon = link.icon;

                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`flex min-h-16 items-center gap-3 px-4 transition-colors hover:bg-muted ${
                        index > 0 ? "border-t border-border" : ""
                      }`}
                    >
                      <Icon aria-hidden className="size-5 text-text-secondary" />
                      <span className="flex flex-1 flex-col">
                        <span className="font-medium text-text">{link.label}</span>
                        <span className="text-xs text-text-secondary">{link.hint}</span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 text-text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <div className="flex flex-col gap-1">
          <p className="px-1 text-sm text-text">{session.name}</p>
          <p className="px-1 text-xs text-text-secondary">{session.email}</p>
        </div>

        <div>
          <LogoutButton />
        </div>
      </div>
    </>
  );
}
