import { cn } from "@/lib/utils";

/**
 * Badge de estado de cuota — Especificación de componentes §3.3.
 * Recetas exactas de Color §5: no se crean variantes locales de estos colores.
 * El color nunca comunica solo: la etiqueta de texto siempre está.
 */

export type InstallmentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "WAIVED";

const STATUS: Record<InstallmentStatus, { label: string; className: string }> = {
  PENDING: {
    label: "Pendiente",
    className: "bg-state-pending-bg text-state-pending-text",
  },
  PARTIAL: {
    label: "Parcial",
    className: "bg-state-partial-bg text-state-partial-text",
  },
  PAID: {
    label: "Pagada",
    className: "bg-state-paid-bg text-state-paid-text",
  },
  OVERDUE: {
    label: "Vencida",
    className: "bg-state-overdue-bg text-state-overdue-text",
  },
  WAIVED: {
    label: "Exonerada",
    className: "bg-state-waived-bg text-state-waived-text",
  },
};

type StatusBadgeProps = React.ComponentProps<"span"> & {
  status: InstallmentStatus;
  /** Punto indicador de 6 px a la izquierda de la etiqueta. */
  dot?: boolean;
};

function StatusBadge({ status, dot = false, className, ...props }: StatusBadgeProps) {
  const { label, className: recipe } = STATUS[status];

  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        recipe,
        className,
      )}
      {...props}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {label}
    </span>
  );
}

export { StatusBadge, STATUS as INSTALLMENT_STATUS };
