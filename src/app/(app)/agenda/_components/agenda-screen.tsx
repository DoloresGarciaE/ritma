"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { useToast } from "@/components/ui/toast";
import type { GroupEnrollmentItem } from "@/server/services/enrollments";
import type { GroupListItem } from "@/server/services/groups";
import type { AgendaOccurrence } from "@/server/services/sessions";

import { AppBar } from "../../_components/app-bar";
import { EmptyState } from "../../_components/empty-state";
import { EnrollSheet, type EnrollStudentOption } from "../../cobranzas/_components/enroll-sheet";
import { AgendaNav } from "./agenda-nav";
import { GroupSheet } from "./group-sheet";
import { GroupsSheet } from "./groups-sheet";
import { SessionDetailSheet } from "./session-detail-sheet";
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
  students,
  roster,
  autoOpenCreate,
  manage,
  isStudio,
  teachers,
}: {
  weekStart: string;
  today: string;
  /** `null` = vista semana. */
  selectedDay: string | null;
  occurrences: AgendaOccurrence[];
  groups: GroupListItem[];
  disciplines: { id: string; name: string }[];
  /** Alumnos ACTIVOS: opciones del sheet de inscripción (S3). */
  students: EnrollStudentOption[];
  /** Inscriptos vigentes por grupo (S3): pinta el detalle de sesión. */
  roster: Record<string, GroupEnrollmentItem[]>;
  autoOpenCreate: boolean;
  /** Owner/admin (S7, §4.3): crear grupos, precio, switch de activo y profe a cargo. */
  manage: boolean;
  isStudio: boolean;
  /** Opciones del selector "Profe a cargo": vacío salvo owner/admin de un STUDIO. */
  teachers: { id: string; displayName: string }[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [groupSheetOpen, setGroupSheetOpen] = useState(autoOpenCreate);
  const [editing, setEditing] = useState<GroupListItem | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [groupsListOpen, setGroupsListOpen] = useState(false);
  const [selected, setSelected] = useState<AgendaOccurrence | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [enrollGroupId, setEnrollGroupId] = useState<string | null>(null);
  const [enrollKey, setEnrollKey] = useState(0);

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
    setDetailOpen(false);
    setEditing(group);
    setSheetKey((key) => key + 1);
    setGroupSheetOpen(true);
  };

  const openDetail = (occurrence: AgendaOccurrence) => {
    toast.closeAll();
    setSelected(occurrence);
    setDetailOpen(true);
  };

  /** Desde el detalle de sesión: cierra el detalle y abre inscribir con el grupo fijo. */
  const openEnroll = (groupId: string) => {
    toast.closeAll();
    setDetailOpen(false);
    setEnrollKey((key) => key + 1);
    setEnrollGroupId(groupId);
  };

  const enrollGroup = enrollGroupId ? groups.find((g) => g.id === enrollGroupId) : undefined;
  // Los ya inscriptos no son opciones: inscribirlos de nuevo solo puede fallar.
  const enrolledIds = new Set(
    (enrollGroupId ? (roster[enrollGroupId] ?? []) : []).map((e) => e.student.id),
  );
  const enrollOptions = students.filter((s) => !enrolledIds.has(s.id));

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
          description={
            manage
              ? "Creá tu primer grupo y armá la agenda: sus clases se generan solas, semana a semana."
              : "Cuando te asignen un grupo, sus clases van a aparecer acá solas."
          }
          action={manage ? { label: "Crear mi primer grupo", onClick: openCreate } : undefined}
        />
      ) : (
        <>
          <AgendaNav weekStart={weekStart} selectedDay={selectedDay} today={today} />
          <WeekView
            days={days}
            today={today}
            occurrences={shownOccurrences}
            onSelect={openDetail}
            showTeacher={isStudio}
          />
        </>
      )}

      {/* El FAB solo cuando ya hay CTA de lista, no encima del EmptyState (§3.13);
          crear grupos es de owner/admin (S7, §4.3). */}
      {manage && groups.length > 0 ? <Fab label="Nuevo grupo" onClick={openCreate} /> : null}

      <GroupSheet
        key={`${editing?.id ?? "nuevo"}-${sheetKey}`}
        open={groupSheetOpen}
        onOpenChange={setGroupSheetOpen}
        disciplines={disciplines}
        group={editing}
        manage={manage}
        isStudio={isStudio}
        teachers={teachers}
      />

      <GroupsSheet
        open={groupsListOpen}
        onOpenChange={setGroupsListOpen}
        groups={groups}
        onEdit={openEdit}
        manage={manage}
        isStudio={isStudio}
      />

      <SessionDetailSheet
        key={selected ? `${selected.slotId}|${selected.originalDate}` : "sin-sesion"}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        occurrence={selected}
        showTeacher={isStudio}
        enrolled={selected ? (roster[selected.groupId] ?? []) : []}
        onEditGroup={(groupId) => {
          const group = groups.find((g) => g.id === groupId);
          if (group) openEdit(group);
        }}
        onEnroll={openEnroll}
      />

      {enrollGroup ? (
        <EnrollSheet
          key={`${enrollGroup.id}-${enrollKey}`}
          open={enrollGroupId !== null}
          onOpenChange={(open) => {
            if (!open) setEnrollGroupId(null);
          }}
          group={{
            id: enrollGroup.id,
            name: enrollGroup.name,
            defaultPrice: enrollGroup.defaultPrice,
          }}
          students={enrollOptions}
          today={today}
        />
      ) : null}
    </>
  );
}
