"use client";

import { createContext, useContext, useId, useState } from "react";

import { formatAmount, parseAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Campos de formulario — Especificación de componentes §3.2 */

const controlStyles = [
  "h-11 w-full rounded-control border border-border-strong bg-surface px-3",
  // 16 px: por debajo de eso, iOS hace zoom al enfocar el campo.
  "text-base text-text placeholder:text-text-secondary",
  "transition-[border-color] aria-invalid:border-danger",
  "disabled:cursor-default disabled:opacity-50",
];

type FieldContextValue = {
  inputId: string;
  messageId: string;
  invalid: boolean;
  hasMessage: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

type FieldProps = {
  label: string;
  /** Ayuda debajo del campo. En error, el mensaje la reemplaza: nunca conviven. */
  helpText?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
};

/** Label arriba del campo (nunca el placeholder como label) + ayuda o error debajo. */
function Field({ label, helpText, error, className, children }: FieldProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const messageId = `${id}-message`;
  const message = error ?? helpText;

  return (
    <FieldContext.Provider
      value={{ inputId, messageId, invalid: Boolean(error), hasMessage: Boolean(message) }}
    >
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
        {children}
        {message ? (
          <p
            id={messageId}
            className={cn("text-xs", error ? "text-danger" : "text-text-secondary")}
          >
            {message}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function Input({
  className,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: React.ComponentProps<"input">) {
  const field = useContext(FieldContext);

  return (
    <input
      data-slot="input"
      id={id ?? field?.inputId}
      aria-invalid={ariaInvalid ?? (field?.invalid || undefined)}
      aria-describedby={ariaDescribedBy ?? (field?.hasMessage ? field.messageId : undefined)}
      className={cn(controlStyles, className)}
      {...props}
    />
  );
}

type AmountInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode"
> & {
  value?: number | null;
  /** Para el caso no controlado (ej. "Registrar pago" llega con la deuda, HU4.3). */
  defaultValue?: number | null;
  onValueChange?: (value: number | null) => void;
};

/** Monto: prefijo $ fijo, teclado numérico y miles formateados al salir del campo. */
function AmountInput({
  className,
  id,
  value,
  defaultValue,
  onValueChange,
  onFocus,
  onBlur,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: AmountInputProps) {
  const field = useContext(FieldContext);
  const isControlled = value !== undefined;

  const [draft, setDraft] = useState(() =>
    defaultValue == null ? "" : formatAmount(defaultValue),
  );
  const [editing, setEditing] = useState(false);

  const displayed = isControlled && !editing ? (value == null ? "" : formatAmount(value)) : draft;

  return (
    // El prefijo va después del input en el DOM (posicionado igual) para que
    // pueda atenuarse con él vía peer-disabled.
    <div className="relative">
      <input
        data-slot="amount-input"
        id={id ?? field?.inputId}
        inputMode="decimal"
        value={displayed}
        aria-invalid={ariaInvalid ?? (field?.invalid || undefined)}
        aria-describedby={ariaDescribedBy ?? (field?.hasMessage ? field.messageId : undefined)}
        className={cn(controlStyles, "peer pl-7 font-display tabular-nums", className)}
        onFocus={(event) => {
          setEditing(true);
          const current = isControlled ? (value ?? null) : parseAmount(draft);
          setDraft(current == null ? "" : String(current).replace(".", ","));
          onFocus?.(event);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          onValueChange?.(parseAmount(event.target.value));
        }}
        onBlur={(event) => {
          setEditing(false);
          const parsed = parseAmount(draft);
          setDraft(parsed == null ? "" : formatAmount(parsed));
          onValueChange?.(parsed);
          onBlur?.(event);
        }}
        {...props}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-text-secondary peer-disabled:opacity-50"
      >
        $
      </span>
    </div>
  );
}

export { AmountInput, Field, Input };
