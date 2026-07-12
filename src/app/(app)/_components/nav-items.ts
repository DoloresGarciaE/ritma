import { CalendarDays, House, Menu, Users, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rutas que no cuelgan por URL pero sí en la navegación (Más es la puerta a estas). */
  owns?: string[];
};

/**
 * Los cinco ítems fijos de Componentes §3.6. **No se agregan ni se reordenan sin
 * actualizar esa spec.** "Más" agrupa estudio y ajustes (Plan §11).
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Inicio", icon: House },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/alumnos", label: "Alumnos", icon: Users },
  { href: "/cobranzas", label: "Cobranzas", icon: Wallet },
  { href: "/mas", label: "Más", icon: Menu, owns: ["/estudio", "/ajustes"] },
];

/**
 * Activo = estás en el ítem o en algo que cuelga de él.
 * La barra del sufijo evita que "/alumnos" matchee "/alumnos-viejos".
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.owns ?? [])].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}
