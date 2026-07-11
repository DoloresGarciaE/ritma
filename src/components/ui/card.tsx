import Link from "next/link";

import { cn } from "@/lib/utils";

/* Card — Especificación de componentes §3.4. Elevación plana: fondo + borde, sin sombra. */

/** Card contenedora. No se anidan cards. */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-card border border-border bg-surface p-4", className)}
      {...props}
    />
  );
}

type MetricCardProps = Omit<React.ComponentProps<typeof Link>, "children"> & {
  label: string;
  value: string;
  /** Contexto opcional debajo del valor ("3 deudores"). */
  context?: string;
};

/** Card de métrica del dashboard: toda la card es tappeable y navega a su detalle. */
function MetricCard({ label, value, context, className, ...props }: MetricCardProps) {
  return (
    <Link
      data-slot="metric-card"
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-card border border-border bg-surface p-4",
        "transition-[background-color,border-color] hover:bg-muted hover:border-border-strong",
        "active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="font-display text-2xl font-medium tabular-nums text-text">{value}</span>
      {context ? <span className="text-xs text-text-secondary">{context}</span> : null}
    </Link>
  );
}

export { Card, MetricCard };
