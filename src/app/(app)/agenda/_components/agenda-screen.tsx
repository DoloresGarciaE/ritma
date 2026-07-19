"use client";

import { CalendarDays } from "lucide-react";

import type { AgendaOccurrence } from "@/server/services/sessions";

import { EmptyState } from "../../_components/empty-state";
import { AgendaNav } from "./agenda-nav";
import { WeekView, weekDays } from "./week-view";

/**
 * La pantalla de Agenda (HU3.2): navegación + semana o día. La lectura viene resuelta
 * del server (la URL es el estado); acá vive solo la interacción — los sheets de grupo
 * y de sesión llegan en los commits de HU3.1 y HU3.3.
 */
export function AgendaScreen({
  weekStart,
  today,
  selectedDay,
  occurrences,
  hasGroups,
}: {
  weekStart: string;
  today: string;
  /** `null` = vista semana. */
  selectedDay: string | null;
  occurrences: AgendaOccurrence[];
  hasGroups: boolean;
}) {
  if (!hasGroups) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Tu semana está vacía"
        description="Creá tu primer grupo y armá la agenda: sus clases se generan solas, semana a semana."
      />
    );
  }

  const days = selectedDay ? [selectedDay] : weekDays(weekStart);
  const shownOccurrences = selectedDay
    ? occurrences.filter((occurrence) => occurrence.date === selectedDay)
    : occurrences;

  return (
    <>
      <AgendaNav weekStart={weekStart} selectedDay={selectedDay} today={today} />
      <WeekView days={days} today={today} occurrences={shownOccurrences} />
    </>
  );
}
