import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight, Settings } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getShellOrganization } from "@/server/organizations";

import { AppBar } from "../_components/app-bar";
import { LogoutButton } from "../_components/logout-button";

export const metadata: Metadata = {
  title: "Más · Ritma",
};

/**
 * "Más" agrupa estudio y ajustes (Plan §11). En una organización independiente no hay nada
 * de estudio: ni el link, ni la palabra (Plan §4, Componentes §4.3 — lo que un rol no puede
 * hacer, no se muestra).
 */
export default async function MasPage() {
  const session = await requireSession();
  const org = await getShellOrganization(session.activeOrgId!);

  const links = [
    ...(org?.type === "STUDIO"
      ? [
          {
            href: "/estudio",
            icon: Building2,
            label: "Estudio",
            hint: "Salones, profes y liquidaciones",
          },
        ]
      : []),
    {
      href: "/ajustes",
      icon: Settings,
      label: "Ajustes",
      hint: "Moneda, vencimientos, disciplinas",
    },
  ];

  return (
    <>
      <AppBar title="Más" />

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
