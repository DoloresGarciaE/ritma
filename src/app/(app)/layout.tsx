import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getShellOrganization } from "@/server/organizations";

import { BottomNav } from "./_components/bottom-nav";
import { Sidebar } from "./_components/sidebar";

/**
 * La guardia real de las rutas privadas: hace falta sesión Y organización. El proxy solo
 * mira si existe la cookie; acá se valida contra la base.
 *
 * Sin organización, lo único que existe es el wizard.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  if (!session.activeOrgId) redirect("/crear-organizacion");

  const org = await getShellOrganization(session.activeOrgId);

  // Membresía huérfana (la org se borró): se trata como si no tuviera ninguna.
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
