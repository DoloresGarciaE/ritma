import { requireSession } from "@/lib/auth";

/**
 * La guardia real de las rutas privadas: valida la sesión contra la base. El proxy
 * solo mira si la cookie existe.
 *
 * El shell de verdad (bottom nav, app bar, sidebar) es F0.5.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();

  return <div className="min-h-screen bg-background">{children}</div>;
}
