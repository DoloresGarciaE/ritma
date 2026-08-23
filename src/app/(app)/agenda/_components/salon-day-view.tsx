"use client";

import { SessionBlock } from "@/components/ui/session-block";
import { formatFullDayDate } from "@/lib/format";
import { buildSalonDay } from "@/lib/salon-calendar";
import { cn } from "@/lib/utils";
import type { AgendaOccurrence } from "@/server/services/sessions";

/**
 * El calendario por salón (S8, HU3.4): columnas de espacio sobre un eje horario, los
 * huecos EXPLÍCITOS ("Libre · HH:mm–HH:mm") y las canceladas tachadas ocupando su
 * lugar. El armado es puro (lib/salon-calendar); acá solo se pinta.
 *
 * Mobile-first: UN panel con scroll propio en las dos direcciones — los encabezados de
 * columna quedan fijos arriba (sticky) y la regla horaria fija a la izquierda mientras
 * las columnas se deslizan. Dos clases cruzadas en el MISMO salón se ven lado a lado
 * (carriles): el choque que la validación avisa también se VE acá.
 */

/** 1 minuto = 1px: una hora son 60px, un bloque de 45' pasa los 44px de target. */
const PX_PER_MIN = 1;

export function SalonDayView({
  day,
  occurrences,
  spaces,
  showTeacher,
  onSelect,
}: {
  day: string;
  /** Las ocurrencias de ESE día, ya scoped al actor (S7) y filtradas por profe si aplica. */
  occurrences: AgendaOccurrence[];
  spaces: { id: string; name: string }[];
  showTeacher: boolean;
  onSelect: (occurrence: AgendaOccurrence) => void;
}) {
  const built = buildSalonDay(occurrences, spaces);
  const height = (built.axisEnd - built.axisStart) * PX_PER_MIN;
  const dateLabel = formatFullDayDate(day);

  return (
    <div className="px-4 pb-4 md:px-6">
      <div className="h-[calc(100dvh-19rem)] min-h-80 overflow-auto overscroll-contain rounded-card border border-border bg-surface">
        <div className="flex w-max min-w-full">
          {/* La regla horaria: fija a la izquierda mientras las columnas se deslizan. */}
          <div className="sticky left-0 z-20 w-12 shrink-0 bg-surface">
            <div className="sticky top-0 z-10 h-9 border-b border-border bg-surface" />
            <div className="relative" style={{ height }}>
              {built.hourMarks.map((mark, index) => (
                <span
                  key={mark}
                  className="absolute right-1.5 text-[10px] text-text-muted tabular-nums"
                  style={{ top: index * 60 * PX_PER_MIN - (index === 0 ? 0 : 7) }}
                >
                  {mark}
                </span>
              ))}
            </div>
          </div>

          {built.columns.map((column) => (
            <div
              key={column.spaceId ?? "sin-salon"}
              className="w-48 shrink-0 border-l border-border first:border-l-0"
            >
              <div className="sticky top-0 z-10 flex h-9 items-center border-b border-border bg-surface px-2">
                <span className="truncate text-sm font-medium text-text">{column.spaceName}</span>
              </div>

              <div className="relative" style={{ height }}>
                {/* Las líneas de hora, detrás de todo. */}
                {built.hourMarks.slice(1).map((mark, index) => (
                  <span
                    key={mark}
                    aria-hidden
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: (index + 1) * 60 * PX_PER_MIN }}
                  />
                ))}

                {column.items.map((item) =>
                  item.kind === "free" ? (
                    <div
                      key={`libre-${item.from}`}
                      className="absolute inset-x-1 flex items-start justify-center rounded-card border border-dashed border-border px-1 py-1.5"
                      style={{
                        top: item.topMin * PX_PER_MIN + 2,
                        height: item.heightMin * PX_PER_MIN - 4,
                      }}
                    >
                      <span className="text-xs text-text-muted">
                        Libre · {item.from}–{item.to}
                      </span>
                    </div>
                  ) : (
                    <SessionBlock
                      key={`${item.occurrence.slotId}|${item.occurrence.originalDate}`}
                      session={item.occurrence}
                      dateLabel={dateLabel}
                      showTeacher={showTeacher}
                      onClick={() => onSelect(item.occurrence)}
                      className={cn("absolute", item.lane > 0 && "z-10 shadow-float")}
                      style={{
                        top: item.topMin * PX_PER_MIN,
                        height: item.heightMin * PX_PER_MIN,
                        left: 4 + item.lane * 16,
                        right: 4,
                        minHeight: 0,
                      }}
                    />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
