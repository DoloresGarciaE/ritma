import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { requireMember } from "@/server/authz";
import { ForbiddenError } from "@/server/services/permissions";
import { getShellOrganization } from "@/server/organizations";

import { BottomNav } from "./_components/bottom-nav";
import { Sidebar } from "./_components/sidebar";

/**
 * La guardia real de las rutas privadas: hace falta sesión Y ser miembro de la
 * organización activa. El proxy solo mira si existe la cookie; acá se valida contra la
 * base. Sin organización, lo único que existe es el wizard.
 *
 * `requireMember` revalida la membresía y resuelve el rol: es la guardia de autorización
 * de todo el subárbol de `(app)`. Las queries org-scoped que cuelgan de acá ya vienen
 * acotadas por `withOrg`.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  if (!session.activeOrgId) redirect("/crear-organizacion");

  // Membresía huérfana (la org se borró, o al usuario lo sacaron): se trata como si no
  // tuviera ninguna y se lo manda al wizard.
  try {
    await requireMember(session.activeOrgId);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/crear-organizacion");
    throw error;
  }

  const org = await getShellOrganization(session.activeOrgId);
  if (!org) redirect("/crear-organizacion");

  return (
    <div className="min-h-screen bg-background">
      <Sidebar orgName={org.name} />

      {/* Despeja la bottom nav fija en mobile, y la sidebar en desktop. */}
      <div className="pb-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:pb-0 md:pl-64">
        {children}
      </div>

      <BottomNav />
    </div>
  );
}
