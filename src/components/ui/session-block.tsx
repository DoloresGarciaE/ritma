"use client";

import { disciplineColorClass } from "@/lib/discipline-colors";
import { cn } from "@/lib/utils";

/**
 * Bloque de sesión — Especificación de componentes §3.7.
 *
 * Chip de la agenda: barra de acento de 3 px con el color de la DISCIPLINA (tokens
 * `discipline-N`, asignación estable por orden de creación), hora en tabular-nums,
 * nombre del grupo. Cancelada: texto tachado en `text-muted`, SIN barra. Reprogramada:
 * el bloque vive en su nueva posición con la etiqueta "Reprogramada" (texto, no color);
 * el horario original lo cuenta el detalle.
 *
 * El salón (solo estudios) llega con `Space` en S8.
 */

export type SessionBlockData = {
  startTime: string;
  groupName: string;
  status: "SCHEDULED" | "CANCELLED" | "DONE";
  moved: boolean;
  colorIndex: number;
};

type SessionBlockProps = Omit<React.ComponentProps<"button">, "children"> & {
  session: SessionBlockData;
  /** Para el aria-label: "martes 12/05". El bloque visual no repite la fecha. */
  dateLabel: string;
};

export function SessionBlock({ session, dateLabel, className, ...props }: SessionBlockProps) {
  const cancelled = session.status === "CANCELLED";

  const ariaLabel = [
    session.groupName,
    session.startTime,
    dateLabel,
    cancelled ? "cancelada" : null,
    session.moved ? "reprogramada" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      data-slot="session-block"
      data-status={session.status}
      aria-label={ariaLabel}
      className={cn(
        "relative flex min-h-11 w-full cursor-pointer items-center gap-3 overflow-hidden",
        "rounded-card border border-border bg-surface py-2 pr-3 pl-4 text-left",
        "transition-[background-color] hover:bg-muted",
        className,
      )}
      {...props}
    >
      {/* La barra de disciplina (3 px). Cancelada: sin barra. */}
      {!cancelled ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-[3px]",
            disciplineColorClass(session.colorIndex),
          )}
        />
      ) : null}

      <span
        className={cn(
          "font-display text-sm tabular-nums",
          cancelled ? "text-text-muted line-through" : "text-text",
        )}
      >
        {session.startTime}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            cancelled ? "text-text-muted line-through" : "text-text",
          )}
        >
          {session.groupName}
        </span>
        {session.moved && !cancelled ? (
          <span className="block text-xs text-text-secondary">Reprogramada</span>
        ) : null}
      </span>
    </button>
  );
}
