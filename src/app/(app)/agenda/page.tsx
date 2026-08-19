import type { Metadata } from "next";

import { requireSession } from "@/lib/auth";
import { DEFAULT_TIMEZONE, isCivilDate, mondayOf, todayInTz } from "@/lib/dates";
import { requireScopedMember } from "@/server/authz";
import {
  getDisciplines,
  getOrgSettings,
  getShellOrganization,
  listActiveSpaces,
  listTeacherOptions,
} from "@/server/organizations";
import { activeRosterByGroup } from "@/server/services/enrollments";
import { listGroups } from "@/server/services/groups";
import { can } from "@/server/services/permissions";
import { weekData } from "@/server/services/sessions";
import { listStudents } from "@/server/services/students";

import { AgendaScreen } from "./_components/agenda-screen";

export const metadata: Metadata = {
  title: "Agenda",
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

  const [{ actor, scope }, org, settings] = await Promise.all([
    requireScopedMember(orgId),
    getShellOrganization(orgId),
    getOrgSettings(orgId),
  ]);
  const today = todayInTz(settings?.timezone ?? DEFAULT_TIMEZONE);

  // §4.3: lo que el rol no puede hacer no se muestra. `manage` gobierna crear grupos,
  // el switch de activo, el precio y el selector de profe; el server valida igual.
  const manage = can(actor, "org:viewAll");
  const isStudio = org?.type === "STUDIO";

  const diaParam = first(params.dia);
  const semanaParam = first(params.semana);
  const vistaParam = first(params.vista);
  // "salones" (S8) existe solo en un ESTUDIO: en una INDEPENDENT el param se ignora y
  // cae a la semana — ni un pixel nuevo ahí (regla dura del ticket).
  const view: "week" | "day" | "salones" =
    vistaParam === "dia" ? "day" : vistaParam === "salones" && isStudio ? "salones" : "week";

  // `?dia` manda sobre `?semana`: las vistas de día definen su propia semana.
  const day = diaParam && isCivilDate(diaParam) ? diaParam : undefined;
  const weekAnchor = day ?? (semanaParam && isCivilDate(semanaParam) ? semanaParam : today);
  const weekStart = mondayOf(weekAnchor);

  const selectedDay =
    view !== "week" ? (day ?? (mondayOf(today) === weekStart ? today : weekStart)) : null;

  const [{ occurrences }, groups, disciplines, students, roster, teachers, spaces] =
    await Promise.all([
      weekData(orgId, scope, weekStart),
      listGroups(orgId, scope, { includeInactive: true }),
      getDisciplines(orgId),
      listStudents(orgId, scope),
      activeRosterByGroup(orgId, scope, today),
      manage && isStudio ? listTeacherOptions(orgId) : Promise.resolve([]),
      // Los salones los ve cualquier miembro del ESTUDIO (columnas del calendario);
      // el selector del form los usa solo con `manage`.
      isStudio ? listActiveSpaces(orgId) : Promise.resolve([]),
    ]);

  // El filtro por profe del calendario (S8): solo owner/admin, y solo un id REAL de la
  // org — un param forjado o ajeno cae en silencio a "todos" (patrón del ?grupo de
  // Cobranzas). Para un teacher no existe: su scope ya filtra.
  const profeParam = first(params.profe);
  const profe =
    view === "salones" && manage && teachers.some((teacher) => teacher.id === profeParam)
      ? (profeParam ?? null)
      : null;

  // La app bar la compone la screen (client): su acción "Grupos" abre un sheet.
  return (
    <AgendaScreen
      weekStart={weekStart}
      today={today}
      selectedDay={selectedDay}
      view={view}
      profe={profe}
      occurrences={occurrences}
      groups={groups}
      disciplines={disciplines}
      students={students.map((s) => ({ id: s.id, name: s.name }))}
      roster={roster}
      autoOpenCreate={manage && first(params.nuevo) === "grupo"}
      manage={manage}
      isStudio={isStudio}
      teachers={teachers}
      spaces={spaces}
    />
  );
}
