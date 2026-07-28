import type { Metadata } from "next";

import { requireSession } from "@/lib/auth";
import { DEFAULT_TIMEZONE, isCivilDate, mondayOf, todayInTz } from "@/lib/dates";
import { getDisciplines, getOrgSettings } from "@/server/organizations";
import { activeRosterByGroup } from "@/server/services/enrollments";
import { listGroups } from "@/server/services/groups";
import { weekData } from "@/server/services/sessions";
import { listStudents } from "@/server/services/students";

import { AgendaScreen } from "./_components/agenda-screen";

export const metadata: Metadata = {
  title: "Agenda · Ritma",
};

/**
 * La agenda (HU3.2): semana y día, server-first.
 *
 * La URL es el estado de navegación — `?semana=<lunes>`, `?vista=dia&dia=<fecha>` — así
 * que moverse entre semanas son `<Link>` prefetcheables y "Hoy" es volver a `/agenda`.
 * Un param inválido no explota: cae en silencio a la semana de hoy. "Hoy" es el de la
 * ZONA DE LA ORG (RN10), no el del servidor.
 */
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const orgId = session.activeOrgId!;
  const params = await searchParams;

  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const settings = await getOrgSettings(orgId);
  const today = todayInTz(settings?.timezone ?? DEFAULT_TIMEZONE);

  const diaParam = first(params.dia);
  const semanaParam = first(params.semana);
  const isDayView = first(params.vista) === "dia";

  // `?dia` manda sobre `?semana`: la vista día define su propia semana.
  const day = diaParam && isCivilDate(diaParam) ? diaParam : undefined;
  const weekAnchor = day ?? (semanaParam && isCivilDate(semanaParam) ? semanaParam : today);
  const weekStart = mondayOf(weekAnchor);

  const selectedDay = isDayView
    ? (day ?? (mondayOf(today) === weekStart ? today : weekStart))
    : null;

  const [{ occurrences }, groups, disciplines, students, roster] = await Promise.all([
    weekData(orgId, weekStart),
    listGroups(orgId, { includeInactive: true }),
    getDisciplines(orgId),
    listStudents(orgId),
    activeRosterByGroup(orgId, today),
  ]);

  // La app bar la compone la screen (client): su acción "Grupos" abre un sheet.
  return (
    <AgendaScreen
      weekStart={weekStart}
      today={today}
      selectedDay={selectedDay}
      occurrences={occurrences}
      groups={groups}
      disciplines={disciplines}
      students={students.map((s) => ({ id: s.id, name: s.name }))}
      roster={roster}
      autoOpenCreate={first(params.nuevo) === "grupo"}
    />
  );
}
