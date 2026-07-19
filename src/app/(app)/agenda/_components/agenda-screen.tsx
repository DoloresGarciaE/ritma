"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { useToast } from "@/components/ui/toast";
import type { GroupListItem } from "@/server/services/groups";
import type { AgendaOccurrence } from "@/server/services/sessions";

import { AppBar } from "../../_components/app-bar";
import { EmptyState } from "../../_components/empty-state";
import { AgendaNav } from "./agenda-nav";
import { GroupSheet } from "./group-sheet";
import { GroupsSheet } from "./groups-sheet";
import { WeekView, weekDays } from "./week-view";

/**
 * La pantalla de Agenda (HU3.2): navegación + semana o día + los sheets de HU3.1.
 * La lectura viene resuelta del server (la URL es el estado); acá vive la interacción.
 *
 * El sheet de grupo se re-montea con `key` en cada apertura: draft siempre fresco, sea
 * crear o editar cualquier grupo. `?nuevo=grupo` (el CTA del dashboard) abre el alta
 * directo y limpia la URL.
 */
export function AgendaScreen({
  weekStart,
  today,
  selectedDay,
  occurrences,
  groups,
  disciplines,
  autoOpenCreate,
}: {
  weekStart: string;
  today: string;
  /** `null` = vista semana. */
  selectedDay: string | null;
  occurrences: AgendaOccurrence[];
  groups: GroupListItem[];
  disciplines: { id: string; name: string }[];
  autoOpenCreate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [groupSheetOpen, setGroupSheetOpen] = useState(autoOpenCreate);
  const [editing, setEditing] = useState<GroupListItem | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [groupsListOpen, setGroupsListOpen] = useState(false);

  // Limpia el `?nuevo=grupo` de la URL (solo navegación, sin setState: el estado inicial
  // del sheet ya salió del prop).
  const cleanedUrl = useRef(false);
  useEffect(() => {
    if (autoOpenCreate && !cleanedUrl.current) {
      cleanedUrl.current = true;
      router.replace("/agenda", { scroll: false });
    }
  }, [autoOpenCreate, router]);

  /** Abrir un formulario cierra los toasts vivos (§3.9, patrón S1). */
  const openCreate = () => {
    toast.closeAll();
    setEditing(null);
    setSheetKey((key) => key + 1);
    setGroupSheetOpen(true);
  };

  const openEdit = (group: GroupListItem) => {
    toast.closeAll();
    setGroupsListOpen(false);
    setEditing(group);
    setSheetKey((key) => key + 1);
    setGroupSheetOpen(true);
  };

  const days = selectedDay ? [selectedDay] : weekDays(weekStart);
  const shownOccurrences = selectedDay
    ? occurrences.filter((occurrence) => occurrence.date === selectedDay)
    : occurrences;

  return (
    <>
      <AppBar
        title="Agenda"
        action={
          groups.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setGroupsListOpen(true)}>
              Grupos
            </Button>
          ) : undefined
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Tu semana está vacía"
          description="Creá tu primer grupo y armá la agenda: sus clases se generan solas, semana a semana."
          action={{ label: "Crear mi primer grupo", onClick: openCreate }}
        />
      ) : (
        <>
          <AgendaNav weekStart={weekStart} selectedDay={selectedDay} today={today} />
          <WeekView days={days} today={today} occurrences={shownOccurrences} />
        </>
      )}

      {/* El FAB solo cuando ya hay CTA de lista, no encima del EmptyState (§3.13). */}
      {groups.length > 0 ? <Fab label="Nuevo grupo" onClick={openCreate} /> : null}

      <GroupSheet
        key={`${editing?.id ?? "nuevo"}-${sheetKey}`}
        open={groupSheetOpen}
        onOpenChange={setGroupSheetOpen}
        disciplines={disciplines}
        group={editing}
      />

      <GroupsSheet
        open={groupsListOpen}
        onOpenChange={setGroupsListOpen}
        groups={groups}
        onEdit={openEdit}
      />
    </>
  );
}
