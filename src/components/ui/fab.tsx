"use client";

import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * FAB — Componentes §3.13. Círculo de 56 px, `primary`, plus blanco, abajo a la derecha,
 * 16 px por encima de la bottom nav (que mide 3.5rem + el safe area), con la sombra flotante.
 *
 * Solo existe en dos pantallas: Alumnos (alta express) y Agenda (nuevo grupo). Máximo uno por
 * pantalla. En ≥ md no hay bottom nav (es sidebar), así que baja a 24 px del borde.
 */

type FabProps = Omit<React.ComponentProps<"button">, "children"> & {
  /** Etiqueta accesible: el FAB es solo un ícono. Ej.: "Nuevo alumno". */
  label: string;
};

function Fab({ label, className, ...props }: FabProps) {
  return (
    <button
      data-slot="fab"
      type="button"
      aria-label={label}
      className={cn(
        "fixed right-4 z-20 grid size-14 cursor-pointer place-items-center rounded-full",
        "bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_1rem)] md:right-6 md:bottom-6",
        "bg-primary text-on-primary shadow-float",
        "transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      <Plus aria-hidden className="size-6" />
    </button>
  );
}

export { Fab };
