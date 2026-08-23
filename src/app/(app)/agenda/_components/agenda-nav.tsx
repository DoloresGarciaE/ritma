"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { addDays, mondayOf } from "@/lib/dates";
import { formatFullDayDate, formatWeekRange } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Navegación de la agenda: toggle Semana | Día (| Salones, S8 — solo estudios) +
 * ‹ rango › + "Hoy".
 *
 * Todo son <Link> sobre searchParams — nada de estado de cliente: la posición vive en la
 * URL, el server siempre trae la semana completa y las vistas día/salones son filtros.
 * "Hoy" es `/agenda` a secas (o su vista): siempre a un tap. El filtro por profe del
 * calendario (S8) viaja en `?profe=` y se conserva al navegar dentro de Salones.
 */

const pillStyles = (selected: boolean) =>
  cn(
    "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
    selected
      ? "border-primary bg-nav-active-bg text-nav-active-text"
      : "border-border-strong bg-surface text-text hover:bg-muted",
  );

export type AgendaView = "week" | "day" | "salones";

export function AgendaNav({
  weekStart,
  selectedDay,
  today,
  view,
  showSalones,
  profe,
}: {
  weekStart: string;
  /** El día de las vistas día/salones; `null` en la vista semana. */
  selectedDay: string | null;
  today: string;
  view: AgendaView;
  /** S8: la pestaña Salones existe solo en un ESTUDIO. */
  showSalones: boolean;
  /** Filtro por profe activo (S8): se conserva al moverse dentro de Salones. */
  profe?: string | null;
}) {
  const currentWeek = mondayOf(today);
  const isDayBased = view !== "week";

  const weekHref = (monday: string) =>
    monday === currentWeek ? "/agenda" : `/agenda?semana=${monday}`;
  const dayHref = (date: string) =>
    date === today ? "/agenda?vista=dia" : `/agenda?vista=dia&dia=${date}`;
  const salonesHref = (date: string) => {
    const query = new URLSearchParams({ vista: "salones" });
    if (date !== today) query.set("dia", date);
    if (profe) query.set("profe", profe);
    return `/agenda?${query.toString()}`;
  };

  // El toggle a una vista de día conserva el día ya elegido; si venís de Semana, muestra
  // hoy si la semana visible lo contiene y si no su lunes. (Un toggle no te saca de donde estás.)
  const dayForToggle = selectedDay ?? (currentWeek === weekStart ? today : weekStart);

  const hrefFor = (date: string) => (view === "salones" ? salonesHref(date) : dayHref(date));
  const prevHref = isDayBased
    ? hrefFor(addDays(selectedDay ?? today, -1))
    : weekHref(addDays(weekStart, -7));
  const nextHref = isDayBased
    ? hrefFor(addDays(selectedDay ?? today, 1))
    : weekHref(addDays(weekStart, 7));

  const label = isDayBased
    ? formatFullDayDate(selectedDay ?? today)
    : formatWeekRange(weekStart, addDays(weekStart, 6));

  return (
    <div className="flex flex-col gap-3 px-4 pt-2 md:px-6">
      <div role="group" aria-label="Vista de la agenda" className="flex gap-2">
        <Link
          href={weekHref(weekStart)}
          aria-current={view === "week" ? "page" : undefined}
          className={pillStyles(view === "week")}
        >
          Semana
        </Link>
        <Link
          href={dayHref(dayForToggle)}
          aria-current={view === "day" ? "page" : undefined}
          className={pillStyles(view === "day")}
        >
          Día
        </Link>
        {showSalones ? (
          <Link
            href={salonesHref(dayForToggle)}
            aria-current={view === "salones" ? "page" : undefined}
            className={pillStyles(view === "salones")}
          >
            Salones
          </Link>
        ) : null}
      </div>

      <nav
        aria-label={isDayBased ? "Cambiar de día" : "Cambiar de semana"}
        className="flex items-center gap-2"
      >
        <Link
          href={prevHref}
          aria-label={isDayBased ? "Día anterior" : "Semana anterior"}
          className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Link>

        <span className="min-w-0 flex-1 truncate text-center font-display text-sm font-medium text-text">
          {label}
        </span>

        <Link
          href={nextHref}
          aria-label={isDayBased ? "Día siguiente" : "Semana siguiente"}
          className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
        >
          <ChevronRight aria-hidden className="size-5" />
        </Link>

        <Link
          href={view === "week" ? "/agenda" : hrefFor(today)}
          className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-primary hover:bg-muted"
        >
          Hoy
        </Link>
      </nav>
    </div>
  );
}
