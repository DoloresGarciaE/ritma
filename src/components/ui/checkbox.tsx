"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — Especificación de componentes §3.2: para opciones dentro de un formulario
 * que se confirma con un botón (el switch, en cambio, es para lo que aplica al instante).
 * Primer uso: elegir varios alumnos para inscribirlos de una vez.
 *
 * Base UI (unstyled) + tokens, como el resto de los primitivos. El dibujo mide 20 px; el
 * área de tap la pone la fila que lo contiene, que es el objetivo real de ≥44 px (§2.3) —
 * por eso acá no hay pseudo-elemento: dos áreas táctiles superpuestas se pelean.
 */
export function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm border",
        "border-border-strong bg-surface transition-[background-color,border-color]",
        "data-checked:border-primary data-checked:bg-primary",
        "disabled:cursor-default disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex text-on-primary">
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
