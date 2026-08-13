import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { resolveLanding } from "@/lib/landing";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Si ya hay sesión, acá no hay nada que hacer: rebota a su destino de entrada
  // (dashboard, o el wizard si no tiene org) — la misma resolución que usa `/`.
  const session = await getSession();
  if (session) redirect(resolveLanding(session));

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-[400px] flex-col gap-6">{children}</div>
    </main>
  );
}
