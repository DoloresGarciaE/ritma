import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, ChevronRight, DoorOpen, KeyRound, Scale, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { requireScopedMember } from "@/server/authz";
import { getShellOrganization } from "@/server/organizations";
import { can } from "@/server/services/permissions";

import { AppBar } from "../_components/app-bar";

export const metadata: Metadata = {
  title: "Estudio",
};

/**
 * Solo para organizaciones de tipo estudio. Owner/admin ven la gestión completa
 * (equipo, salones, liquidaciones — S7/S8/S9); desde S9 una profe STAFF también entra:
 * su única puerta es "Mis liquidaciones" (HU6.4, settlements:viewOwn — §4.3: se muestra
 * exactamente lo que puede). Un teacher sin perfil no tiene nada acá.
 *
 * Devuelve 404 y no redirige: un redirect confirmaría que la ruta existe (Componentes §4.3).
 */
export default async function EstudioPage() {
  const session = await requireSession();
  const org = await getShellOrganization(session.activeOrgId!);

  if (org?.type !== "STUDIO") notFound();

  const { actor, scope } = await requireScopedMember(session.activeOrgId!);
  const manage = can(actor, "members:manage");
  const isTeacherWithProfile = scope.kind === "teacher" && scope.teacherProfileId !== null;
  if (!manage && !isTeacherWithProfile) notFound();

  const links = manage
    ? [
        {
          href: "/estudio/equipo",
          icon: Users,
          label: "Equipo",
          hint: "Profes, admins, invitaciones y acuerdos",
        },
        {
          href: "/estudio/salones",
          icon: DoorOpen,
          label: "Salones",
          hint: "Los espacios del estudio y su calendario",
        },
        {
          href: "/estudio/liquidaciones",
          icon: Scale,
          label: "Liquidaciones",
          hint: "El cierre de mes de cada profe (RN6)",
        },
        {
          href: "/estudio/alquileres",
          icon: KeyRound,
          label: "Alquileres",
          hint: "Los cargos de los profes externos",
        },
        {
          href: "/estudio/reportes",
          icon: BarChart3,
          label: "Reportes",
          hint: "Ingresos por profe y por disciplina",
        },
      ]
    : [
        {
          href: "/estudio/liquidaciones",
          icon: Scale,
          label: "Mis liquidaciones",
          hint: "Tu cierre de mes, con el detalle que lo compone",
        },
      ];

  return (
    <>
      <AppBar title="Estudio" back="/mas" />

      <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
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
      </div>
    </>
  );
}
