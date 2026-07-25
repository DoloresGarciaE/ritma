"use client";

import { useSyncExternalStore } from "react";

/**
 * Mobile-first: en el server (y en el primer render del cliente) devuelve `false`, así que
 * lo que se pinta primero es siempre la variante de teléfono.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
