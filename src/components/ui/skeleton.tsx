import { cn } from "@/lib/utils";

/**
 * Skeleton — Especificación de componentes §3.14: bloque `muted` (Neutro 100 en claro,
 * `#292833` en oscuro — el token ES esos dos valores) con pulso de opacidad de 1.5 s,
 * replicando la silueta real del contenido. `prefers-reduced-motion` lo deja quieto.
 *
 * Es decorativo: los `loading.tsx` que lo componen llevan `role="status"` + aria-label
 * en el contenedor, no cada bloque.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("rounded-card bg-muted motion-safe:animate-skeleton", className)}
      {...props}
    />
  );
}

export { Skeleton };
