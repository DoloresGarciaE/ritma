import { cn } from "@/lib/utils";

/**
 * Isotipo de Ritma (Marca §5.2): la sílaba "ri" con el pulso coral elevado. Trazos del
 * SVG oficial, colores por tokens — igual que el logotipo, un solo componente rinde la
 * versión clara y la oscura (Marca §5.5).
 *
 * Es la pieza para espacios reducidos y el SELLO DEL COMPROBANTE (§5.2): encabezado y
 * pie de `/r/[token]`. Tamaño mínimo: 16 px de alto (§5.4); por encima de 24 px de alto
 * ya puede ir el logotipo.
 */
export function RitmaIsotipo({ className }: { className?: string }) {
  return (
    <svg viewBox="-2 3 32 56" role="img" aria-label="Ritma" className={cn("h-6 w-auto", className)}>
      <g
        fill="none"
        stroke="var(--text)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 32 V52" />
        <path d="M3 42 A10 10 0 0 1 13 32" />
        <path d="M25 32 V52" />
      </g>
      {/* El pulso: el único elemento de color (Marca §5.1). */}
      <circle cx="25" cy="12" r="4.5" fill="var(--accent)" />
    </svg>
  );
}
