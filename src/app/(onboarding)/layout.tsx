import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";

/**
 * Guardia espejo de la de (app): acá se entra SOLO sin organización.
 *
 * Las dos leen el mismo dato fresco —`activeOrgId` se recalcula contra la base en cada
 * `getSession()`—, así que no pueden contradecirse y no hay loop posible.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  if (session.activeOrgId) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col px-4 py-8 md:px-6">
      {children}
    </main>
  );
}
