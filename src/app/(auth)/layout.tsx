import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Si ya hay sesión, acá no hay nada que hacer. Sin organización, el único destino
  // posible es el wizard: mandarlo al dashboard sería un rebote inútil.
  const session = await getSession();
  if (session) redirect(session.activeOrgId ? "/dashboard" : "/crear-organizacion");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-[400px] flex-col gap-6">{children}</div>
    </main>
  );
}
