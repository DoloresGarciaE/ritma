import { RitmaIsotipo } from "@/components/brand/ritma-isotipo";

/**
 * Carga de pantalla completa — el "splash" de la PWA (§3.14): el isotipo con el pulso
 * latiendo (Marca §8). Aparece en la primera navegación de cualquier ruta; las cargas
 * DENTRO del shell usan skeletons por pantalla, no esto.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Cargando Ritma"
      className="flex min-h-dvh items-center justify-center bg-background"
    >
      <RitmaIsotipo pulse className="h-16" />
    </div>
  );
}
