import { cn } from "@/lib/utils";

/**
 * Logotipo de Ritma (Marca §5.2). Los trazos son los del SVG oficial, sin redibujar nada.
 *
 * Lo único que cambia son los colores, que salen de tokens en vez de hexes fijos — y no es
 * una licencia: Marca §5.5 pide letras Tinta 900 + pulso Coral 500 sobre fondo claro, y
 * Blanco roto + Coral 300 sobre fondo oscuro. Esos cuatro valores son exactamente nuestros
 * tokens `text` y `accent` en cada modo, así que este único componente rinde las dos
 * versiones oficiales (principal y negativa) sin duplicar el asset.
 *
 * Tamaño mínimo: 96 px de ancho (§5.4). Por debajo de 24 px de alto va el isotipo, no esto.
 * Área de respeto: 2 pulsos = 0.12 × ancho (a 96 px, ~12 px). Nada entra ahí.
 */
export function RitmaLogotipo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-4 2 150 58"
      role="img"
      aria-label="Ritma"
      className={cn("h-auto w-24", className)}
    >
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
        <path d="M45 12 V52" />
        <path d="M37 30 H53" />
        <path d="M65 52 V42 A10 10 0 0 1 85 42 V52" />
        <path d="M85 42 A10 10 0 0 1 105 42 V52" />
        <circle cx="127" cy="42" r="10" />
        <path d="M137 32 V52" />
      </g>
      {/* El pulso: el único elemento de color (Marca §5.1). */}
      <circle cx="25" cy="12" r="4.5" fill="var(--accent)" />
    </svg>
  );
}
