import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { getOrgSettings } from "@/server/organizations";
import { listEnrollmentsForStudent } from "@/server/services/enrollments";
import { listGroups } from "@/server/services/groups";
import { getStudent } from "@/server/services/students";

import { AppBar } from "../../_components/app-bar";
import { EnrollmentsCard } from "./_components/enrollments-card";
import { StudentDetail } from "./_components/student-detail";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession();
  const student = await getStudent(session.activeOrgId!, id);

  return { title: student ? `${student.name} · Ritma` : "Alumno · Ritma" };
}

/**
 * Ficha de alumno (HU2.2 + HU2.3 + HU4.1).
 *
 * Desde S3: datos editables, inscripciones con alta/baja y estado de cuenta. El historial
 * de recordatorios llega en S5.
 *
 * `notFound()` y no un redirect: con el id de un alumno de OTRA organización, `getStudent`
 * devuelve null (withOrg lo filtra) y respondemos 404. Un redirect confirmaría que existe.
 */
export default async function StudentPage({ params }: Params) {
  const { id } = await params;
  const session = await requireSession();
  const orgId = session.activeOrgId!;

  const [student, enrollments, groups, settings] = await Promise.all([
    getStudent(orgId, id),
    listEnrollmentsForStudent(orgId, id),
    listGroups(orgId),
    getOrgSettings(orgId),
  ]);

  if (!student) notFound();

  const today = todayInTz(settings?.timezone ?? "");

  return (
    <>
      <AppBar title={student.name} back="/alumnos" />
      <StudentDetail
        student={student}
        billing={
          <EnrollmentsCard
            student={{ id: student.id, name: student.name }}
            enrollments={enrollments}
            groups={groups.map((g) => ({
              id: g.id,
              name: g.name,
              defaultPrice: g.defaultPrice,
            }))}
            today={today}
          />
        }
      />
    </>
  );
}
