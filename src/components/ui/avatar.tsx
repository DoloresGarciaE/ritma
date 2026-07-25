import { initialsOf } from "@/lib/students";
import { cn } from "@/lib/utils";

/**
 * Avatar de iniciales — Componentes §3.11. Dos letras sobre `avatar-bg` con texto
 * `avatar-text` (Violeta 100/800 en claro: 8.82:1; Violeta 900/200 en oscuro: 8.21:1).
 *
 * **Sin fotos de alumnos en el MVP** (spec §3.11: evita gestión de imágenes y consentimiento).
 *
 * Es decorativo (`aria-hidden`): el nombre siempre está al lado, y un lector de pantalla no
 * tiene por qué escucharlo dos veces.
 */

const SIZES = {
  sm: "size-8 text-xs", // 32 px
  md: "size-10 text-sm", // 40 px
  lg: "size-14 text-base", // 56 px
} as const;

type AvatarProps = React.ComponentProps<"span"> & {
  /** Nombre completo: de acá salen las iniciales. */
  name: string;
  size?: keyof typeof SIZES;
};

function Avatar({ name, size = "md", className, ...props }: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full select-none",
        "bg-avatar-bg font-medium text-avatar-text",
        SIZES[size],
        className,
      )}
      {...props}
    >
      {initialsOf(name)}
    </span>
  );
}

export { Avatar };
