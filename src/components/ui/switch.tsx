"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

/**
 * Switch — Especificación de componentes §3.2: SOLO para estados que aplican al
 * instante (el ejemplo canónico es "Grupo activo"). Para elecciones que se confirman
 * con un CTA van radios o checkboxes, no esto.
 *
 * Base UI (unstyled) + tokens de Ritma, como el resto de los primitivos.
 */

export function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-0.5",
        "bg-border-strong transition-[background-color] data-checked:bg-primary",
        "disabled:cursor-default disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "size-5 rounded-full bg-surface shadow-sm transition-transform",
          "data-checked:translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
