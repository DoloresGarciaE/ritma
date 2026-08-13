"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* Campo de contraseña — Especificación de componentes §3.2 (variante contraseña) */

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

/**
 * Input de contraseña con ver/ocultar. Compone al Input del sistema (mismo Field,
 * mismos estados): el toggle es un botón DENTRO del campo, a la derecha, después
 * del input en el DOM — el orden de tab queda natural (campo → toggle).
 *
 * Siempre nace oculto y VUELVE a oculto en cada submit del form (y al desmontar,
 * porque el estado es local): una contraseña visible no sobrevive a la pantalla.
 */
function PasswordInput({ className, disabled, ref, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const innerRef = useRef<HTMLInputElement>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  // El submit del form (aunque el handler haga preventDefault) re-oculta la
  // contraseña: si el envío falla y volvemos al formulario, no queda expuesta.
  useEffect(() => {
    const form = innerRef.current?.form;
    if (!form) return;
    const hide = () => setVisible(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  const toggle = () => {
    const input = innerRef.current;
    if (!input) return;

    // Cambiar el type resetea el cursor: el navegador recrea el editor interno del
    // input DESPUÉS de este handler, así que la restauración se difiere (verificado:
    // restaurar sincrónico pierde contra ese reset). Solo si el campo tenía el foco
    // — que un tap en el toggle no le roba: su pointerdown cancela el default.
    const hadFocus = document.activeElement === input;
    const { selectionStart, selectionEnd, selectionDirection } = input;
    setVisible((current) => !current);
    if (hadFocus) {
      window.setTimeout(() => {
        input.focus();
        input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? "none");
      }, 0);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={setRefs}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        data-slot="password-toggle"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        disabled={disabled}
        // Sin default del pointerdown, el botón no captura el foco: quien está
        // tipeando toca el ojo y sigue en el campo, con el cursor donde estaba.
        onPointerDown={(event) => event.preventDefault()}
        onClick={toggle}
        className={cn(
          "absolute inset-y-0 right-0 flex w-11 items-center justify-center",
          "rounded-control text-text-secondary transition-[color,background-color]",
          "enabled:hover:bg-muted enabled:hover:text-text",
          "disabled:cursor-default disabled:opacity-50",
        )}
      >
        {visible ? (
          <EyeOff aria-hidden className="size-5" />
        ) : (
          <Eye aria-hidden className="size-5" />
        )}
      </button>
    </div>
  );
}

export { PasswordInput };
