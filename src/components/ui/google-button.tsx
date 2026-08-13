import { cn } from "@/lib/utils";

/* Botón "Continuar con Google" — Especificación de componentes §3.17 */

/**
 * El logotipo G, transcrito LITERAL del configurador oficial de Google
 * (developers.google.com/identity/branding-guidelines). No se recolorea, no se
 * redibuja y no se usa suelto fuera de este botón: los tres están prohibidos
 * explícitamente por los lineamientos.
 *
 * Son cinco paths: los cuatro de color más uno `fill="none"` que fija la caja de 48×48.
 */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="block size-5 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

type GoogleButtonProps = Omit<React.ComponentProps<"button">, "type" | "children">;

/**
 * Los lineamientos de Google son NORMATIVOS acá (cumplirlos es requisito para verificar
 * la app), así que este botón NO usa el Button del sistema: sus colores, su tipografía y
 * su radio salen de Google, no de Ritma. Las únicas licencias que nos tomamos, las dos
 * amparadas por los propios lineamientos, están documentadas en §3.17: alto 48 y ancho
 * completo (para igualar la prominencia del CTA de al lado y el target táctil de Ritma),
 * y el texto traducido — "Localization of this text is permitted and encouraged".
 *
 * `loading` no muestra spinner: el flujo es una redirección de página completa a Google,
 * así que el botón solo tiene que dejar de aceptar clics mientras el navegador se va.
 */
function GoogleButton({ className, disabled, ...props }: GoogleButtonProps) {
  return (
    <button
      type="button"
      data-slot="google-button"
      disabled={disabled}
      className={cn(
        // Geometría de Google: alto 40 (acá 48), radio 4, padding 12, logo 20 con 10 de aire.
        "relative flex h-12 w-full items-center justify-center gap-2.5 rounded-[4px] px-3",
        "border border-google-btn-border bg-google-btn-bg text-google-btn-text",
        // La tipografía es la que emite el propio configurador de Google. Ritma no carga
        // Roboto: sin ella cae a Arial, exactamente como en el snippet oficial. La pista
        // `family-name:` es obligatoria — sin ella Tailwind no sabe que `font-[…]` es la
        // familia y la clase se descarta en silencio (el botón hereda Inter).
        "font-[family-name:Roboto,arial,sans-serif] text-sm font-medium tracking-[0.25px]",
        "cursor-pointer transition-[box-shadow,opacity]",
        "enabled:hover:shadow-[0_1px_2px_0_rgba(60,64,67,.30),0_1px_3px_1px_rgba(60,64,67,.15)]",
        "disabled:cursor-default disabled:opacity-[0.38]",
        className,
      )}
      {...props}
    >
      <GoogleG />
      Continuar con Google
    </button>
  );
}

export { GoogleButton };
