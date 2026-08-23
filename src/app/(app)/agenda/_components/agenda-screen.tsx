"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Fab } from "@/components/ui/fab";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { GroupEnrollmentItem } from "@/server/services/enrollments";
import type { GroupListItem } from "@/server/services/groups";
import type { AgendaOccurrence } from "@/server/services/sessions";

import Link from "next/link";

import { AppBar } from "../../_components/app-bar";
import { EmptyState } from "../../_components/empty-state";
import { EnrollSheet, type EnrollStudentOption } from "../../cobranzas/_components/enroll-sheet";
import { AgendaNav, type AgendaView } from "./agenda-nav";
import { GroupSheet } from "./group-sheet";
import { GroupsSheet } from "./groups-sheet";
import { SalonDayView } from "./salon-day-view";
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
  view,
  profe,
  occurrences,
  groups,
  disciplines,
  students,
  roster,
  autoOpenCreate,
  manage,
  isStudio,
  teachers,
  spaces,
}: {
  weekStart: string;
  today: string;
  /** `null` = vista semana; con las vistas día/salones trae el día visible. */
  selectedDay: string | null;
  view: AgendaView;
  /** Filtro por profe del calendario (S8), ya VALIDADO por el server; null = todos. */
  profe: string | null;
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
  /** Salones ACTIVOS (S8): columnas del calendario y selector del form (STUDIO). */
  spaces: { id: string; name: string }[];
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

  // El calendario por salón (S8): el día visible, con el filtro por profe aplicado.
  const salonDay = selectedDay ?? today;
  const salonOccurrences = occurrences.filter(
    (occurrence) =>
      occurrence.date === salonDay && (profe === null || occurrence.teacherId === profe),
  );
  const showProfeFilter = view === "salones" && manage && teachers.length > 0;

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
          <AgendaNav
            weekStart={weekStart}
            selectedDay={selectedDay}
            today={today}
            view={view}
            showSalones={isStudio}
            profe={profe}
          />

          {showProfeFilter ? (
            <div
              role="group"
              aria-label="Filtrar por profe"
              className="flex gap-2 overflow-x-auto px-4 pt-3 md:px-6"
            >
              <ProfeChip href={profeHref(salonDay, today, null)} selected={profe === null}>
                Todos los profes
              </ProfeChip>
              {teachers.map((teacher) => (
                <ProfeChip
                  key={teacher.id}
                  href={profeHref(salonDay, today, teacher.id)}
                  selected={profe === teacher.id}
                >
                  {teacher.displayName}
                </ProfeChip>
              ))}
            </div>
          ) : null}

          {view === "salones" ? (
            <div className="pt-3">
              <SalonDayView
                day={salonDay}
                occurrences={salonOccurrences}
                spaces={spaces}
                showTeacher
                onSelect={openDetail}
              />
            </div>
          ) : (
            <WeekView
              days={days}
              today={today}
              occurrences={shownOccurrences}
              onSelect={openDetail}
              showTeacher={isStudio}
            />
          )}
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
        spaces={spaces}
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

/** El href del filtro por profe (S8): conserva vista y día, cambia solo `?profe`. */
function profeHref(day: string, today: string, profe: string | null): string {
  const query = new URLSearchParams({ vista: "salones" });
  if (day !== today) query.set("dia", day);
  if (profe) query.set("profe", profe);
  return `/agenda?${query.toString()}`;
}

function ProfeChip({
  href,
  selected,
  children,
}: {
  href: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
        selected
          ? "border-primary bg-nav-active-bg text-nav-active-text"
          : "border-border-strong bg-surface text-text hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}
