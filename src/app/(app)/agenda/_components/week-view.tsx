"use client";

import { SessionBlock } from "@/components/ui/session-block";
import { addDays } from "@/lib/dates";
import { formatFullDayDate, formatListDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgendaOccurrence } from "@/server/services/sessions";

/**
 * La semana como lista vertical (HU3.2, elección de S2): los 7 encabezados SIEMPRE
 * visibles —el escaneo es predecible—, cada día con sus bloques §3.7 y "Sin clases" en
 * los vacíos. La vista día es esta misma lista con un solo día.
 */
export function WeekView({
  days,
  today,
  occurrences,
  onSelect,
  showTeacher = false,
}: {
  days: string[];
  today: string;
  occurrences: AgendaOccurrence[];
  onSelect?: (occurrence: AgendaOccurrence) => void;
  /** S7/S8: profe y salón en cada bloque, solo en la agenda de un ESTUDIO. */
  showTeacher?: boolean;
}) {
  const byDate = new Map<string, AgendaOccurrence[]>();
  for (const occurrence of occurrences) {
    const list = byDate.get(occurrence.date) ?? [];
    list.push(occurrence);
    byDate.set(occurrence.date, list);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-3 pb-4 md:px-6">
      {days.map((date) => {
        const sessions = byDate.get(date) ?? [];
        const isToday = date === today;

        return (
          <section key={date} aria-label={formatFullDayDate(date)}>
            <h2
              className={cn(
                "mb-1.5 flex items-baseline gap-1.5 text-sm",
                isToday ? "font-medium text-primary" : "font-medium text-text-secondary",
              )}
            >
              {formatListDate(date)}
              {isToday ? <span className="text-xs">· Hoy</span> : null}
            </h2>

            {sessions.length === 0 ? (
              <p className="py-1 text-sm text-text-muted">Sin clases</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sessions.map((occurrence) => (
                  <SessionBlock
                    key={`${occurrence.slotId}|${occurrence.originalDate}`}
                    session={occurrence}
                    dateLabel={formatFullDayDate(date)}
                    showTeacher={showTeacher}
                    showSpace={showTeacher}
                    onClick={onSelect ? () => onSelect(occurrence) : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Los 7 días de la semana de `weekStart`, lunes → domingo. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
