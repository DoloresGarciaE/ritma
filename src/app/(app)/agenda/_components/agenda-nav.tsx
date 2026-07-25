"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { addDays, mondayOf } from "@/lib/dates";
import { formatFullDayDate, formatWeekRange } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Navegación de la agenda: toggle Semana | Día (elección de S2) + ‹ rango › + "Hoy".
 *
 * Todo son <Link> sobre searchParams — nada de estado de cliente: la posición vive en la
 * URL, el server siempre trae la semana completa y la vista día es un filtro. "Hoy" es
 * `/agenda` a secas (o `?vista=dia`): siempre a un tap.
 */

const pillStyles = (selected: boolean) =>
  cn(
    "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
    selected
      ? "border-primary bg-nav-active-bg text-nav-active-text"
      : "border-border-strong bg-surface text-text hover:bg-muted",
  );

export function AgendaNav({
  weekStart,
  selectedDay,
  today,
}: {
  weekStart: string;
  /** `null` = vista semana. */
  selectedDay: string | null;
  today: string;
}) {
  const isDayView = selectedDay !== null;
  const currentWeek = mondayOf(today);

  const weekHref = (monday: string) =>
    monday === currentWeek ? "/agenda" : `/agenda?semana=${monday}`;
  const dayHref = (date: string) =>
    date === today ? "/agenda?vista=dia" : `/agenda?vista=dia&dia=${date}`;

  // El toggle a Día conserva el día ya elegido; si venís de Semana, muestra hoy si la
  // semana visible lo contiene y si no su lunes. (Un toggle activo no te saca de donde estás.)
  const dayForToggle = selectedDay ?? (currentWeek === weekStart ? today : weekStart);

  const prevHref = isDayView ? dayHref(addDays(selectedDay, -1)) : weekHref(addDays(weekStart, -7));
  const nextHref = isDayView ? dayHref(addDays(selectedDay, 1)) : weekHref(addDays(weekStart, 7));

  const label = isDayView
    ? formatFullDayDate(selectedDay)
    : formatWeekRange(weekStart, addDays(weekStart, 6));

  return (
    <div className="flex flex-col gap-3 px-4 pt-2 md:px-6">
      <div role="group" aria-label="Vista de la agenda" className="flex gap-2">
        <Link
          href={weekHref(weekStart)}
          aria-current={!isDayView ? "page" : undefined}
          className={pillStyles(!isDayView)}
        >
          Semana
        </Link>
        <Link
          href={dayHref(dayForToggle)}
          aria-current={isDayView ? "page" : undefined}
          className={pillStyles(isDayView)}
        >
          Día
        </Link>
      </div>

      <nav
        aria-label={isDayView ? "Cambiar de día" : "Cambiar de semana"}
        className="flex items-center gap-2"
      >
        <Link
          href={prevHref}
          aria-label={isDayView ? "Día anterior" : "Semana anterior"}
          className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Link>

        <span className="min-w-0 flex-1 truncate text-center font-display text-sm font-medium text-text">
          {label}
        </span>

        <Link
          href={nextHref}
          aria-label={isDayView ? "Día siguiente" : "Semana siguiente"}
          className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
        >
          <ChevronRight aria-hidden className="size-5" />
        </Link>

        <Link
          href={isDayView ? "/agenda?vista=dia" : "/agenda"}
          className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-primary hover:bg-muted"
        >
          Hoy
        </Link>
      </nav>
    </div>
  );
}
