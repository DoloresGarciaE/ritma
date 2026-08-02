import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { isR2Configured } from "@/lib/r2";
import { requireMember } from "@/server/authz";
import { getOrgSettings, getShellOrganization } from "@/server/organizations";
import { listChargesForStudent } from "@/server/services/charges";
import { listEnrollmentsForStudent } from "@/server/services/enrollments";
import { listGroups } from "@/server/services/groups";
import { listPaymentsForStudent, paymentContext } from "@/server/services/payments";
import { can } from "@/server/services/permissions";
import { getStudent } from "@/server/services/students";

import { AppBar } from "../../_components/app-bar";
import { AccountStatementCard } from "./_components/account-statement-card";
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

  // La membresía revalidada trae el ROL: editar montos y exonerar es de owner/admin, y lo
  // que un rol no puede hacer no se le muestra (§4.3) — el server lo valida igual.
  const [actor, student, enrollments, charges, payments, context, groups, settings, shellOrg] =
    await Promise.all([
      requireMember(orgId),
      getStudent(orgId, id),
      listEnrollmentsForStudent(orgId, id),
      listChargesForStudent(orgId, id),
      listPaymentsForStudent(orgId, id),
      paymentContext(orgId, id),
      listGroups(orgId),
      getOrgSettings(orgId),
      getShellOrganization(orgId),
    ]);

  if (!student) notFound();

  const today = todayInTz(settings?.timezone ?? "");

  return (
    <>
      <AppBar title={student.name} back="/alumnos" />
      <StudentDetail
        student={student}
        billing={
          <>
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
            <AccountStatementCard
              studentId={student.id}
              studentName={student.name}
              charges={charges}
              payments={payments}
              credit={context.credit}
              canManage={can(actor, "org:configure")}
              isStudio={shellOrg?.type === "STUDIO"}
              attachmentsEnabled={isR2Configured()}
              today={today}
            />
          </>
        }
      />
    </>
  );
}
