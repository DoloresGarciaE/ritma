import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";

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
 * Solo para organizaciones de tipo estudio, y solo para owner/admin (S7): lo que hay
 * acá — equipo hoy; salones (S8) y liquidaciones (S9) después — es gestión, y la matriz
 * la reserva. Un TEACHER no tiene nada que hacer acá hasta que S9 traiga "ver la
 * liquidación propia".
 *
 * Devuelve 404 y no redirige: un redirect confirmaría que la ruta existe (Componentes §4.3).
 */
export default async function EstudioPage() {
  const session = await requireSession();
  const org = await getShellOrganization(session.activeOrgId!);

  if (org?.type !== "STUDIO") notFound();

  const { actor } = await requireScopedMember(session.activeOrgId!);
  if (!can(actor, "members:manage")) notFound();

  return (
    <>
      <AppBar title="Estudio" back="/mas" />

      <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
        <Card className="flex flex-col gap-0 p-0">
          <ul className="flex flex-col">
            <li>
              <Link
                href="/estudio/equipo"
                className="flex min-h-16 items-center gap-3 px-4 transition-colors hover:bg-muted"
              >
                <Users aria-hidden className="size-5 text-text-secondary" />
                <span className="flex flex-1 flex-col">
                  <span className="font-medium text-text">Equipo</span>
                  <span className="text-xs text-text-secondary">
                    Profes, admins e invitaciones
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 text-text-muted" />
              </Link>
            </li>
          </ul>
        </Card>

        <p className="px-1 text-xs text-text-secondary">
          Los salones y las liquidaciones de fin de mes llegan en los próximos bloques.
        </p>
      </div>
    </>
  );
}
