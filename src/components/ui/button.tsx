import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const TOUCH_TARGET =
  "after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 after:content-['']";

const buttonVariants = cva(
  [
    "relative inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap",
    "rounded-control font-medium transition-[color,background-color,border-color,transform]",
    "[&_svg]:shrink-0 active:scale-[0.98]",
    "disabled:cursor-default disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary enabled:hover:bg-primary-hover",
        secondary: "border border-border-strong bg-surface text-text enabled:hover:bg-muted",
        ghost: "text-text-secondary enabled:hover:bg-muted",
        destructive:
          "bg-destructive text-on-destructive enabled:hover:bg-destructive-hover",
        link: "text-primary underline-offset-4 enabled:hover:text-primary-hover enabled:hover:underline",
      },
      size: {
        // El área táctil llega a 44 px aunque el dibujo sea menor (Componentes §2.3)
        sm: `h-8 px-3 text-sm [&_svg]:size-4 ${TOUCH_TARGET}`,
        md: `h-10 px-4 text-sm [&_svg]:size-4 ${TOUCH_TARGET}`,
        lg: "h-12 px-5 text-base [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Ícono Lucide a la izquierda del texto; el spinner lo reemplaza al cargar. */
    icon?: React.ReactNode;
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  icon,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !icon ? (
        // Sin ícono no hay lugar donde poner el spinner: se superpone al texto,
        // que queda invisible pero ocupando su lugar. El ancho no cambia (§2.3).
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <span className="absolute inset-0 m-auto inline-flex items-center justify-center">
            <Loader2 aria-hidden className="size-4 animate-spin" />
          </span>
        </>
      ) : (
        <>
          {loading ? <Loader2 aria-hidden className="animate-spin" /> : icon}
          {children}
        </>
      )}
    </button>
  );
}

export { Button, buttonVariants };
