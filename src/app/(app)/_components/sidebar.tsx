"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { RitmaLogotipo } from "@/components/brand/ritma-logotipo";
import { cn } from "@/lib/utils";

import { isNavItemActive, NAV_ITEMS } from "./nav-items";

/**
 * Sidebar desde `md` (Componentes §3.6): misma estructura y jerarquía que la bottom nav,
 * con el logotipo arriba. El ítem activo usa los tokens `nav-active-*`.
 *
 * El logotipo va a 96 px (mínimo de Marca §5.4) y su área de respeto (2 pulsos ≈ 12 px a
 * esa escala) queda cubierta por el padding de 16 px y la separación con los ítems.
 */
export function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface p-4 md:flex">
      <div className="flex flex-col gap-1 p-2">
        <RitmaLogotipo className="w-24" />
        <span className="truncate text-xs text-text-secondary">{orgName}</span>
      </div>

      <nav aria-label="Navegación principal" className="mt-6">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-nav-active-bg text-nav-active-text"
                      : "text-text-secondary hover:bg-muted",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
