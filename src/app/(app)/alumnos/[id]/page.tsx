import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { periodOf, todayInTz } from "@/lib/dates";
import { isEmailConfigured } from "@/lib/email";
import { isR2Configured } from "@/lib/r2";
import { waLink } from "@/lib/whatsapp";
import { requireScopedMember } from "@/server/authz";
import { getOrgSettings, getShellOrganization, listTeacherOptions } from "@/server/organizations";
import { listChargesForStudent } from "@/server/services/charges";
import { listEnrollmentsForStudent } from "@/server/services/enrollments";
import { listGroups } from "@/server/services/groups";
import { listPaymentsForStudent, paymentContext } from "@/server/services/payments";
import { can } from "@/server/services/permissions";
import { buildReminder, listRemindersForStudent } from "@/server/services/reminders";
import { getStudent } from "@/server/services/students";

import { AppBar } from "../../_components/app-bar";
import { AccountStatementCard } from "./_components/account-statement-card";
import { EnrollmentsCard } from "./_components/enrollments-card";
import { RemindersCard } from "./_components/reminders-card";
import { StudentDetail } from "./_components/student-detail";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession();
  const { scope } = await requireScopedMember(session.activeOrgId!);
  const student = await getStudent(session.activeOrgId!, scope, id);

  return { title: student ? student.name : "Alumno" };
}

/**
 * Ficha de alumno (HU2.2 + HU2.3 + HU4.1).
 *
 * Desde S3: datos editables, inscripciones con alta/baja y estado de cuenta. Desde S5:
 * recordatorios (WhatsApp/email sobre la deuda del período en curso) y su historial —
 * lo último que HU2.2 dejaba pendiente. Desde S7, todo con el `scope` del actor: la
 * ficha de un alumno ajeno al scope de un teacher es un 404, igual que la de otra org.
 *
 * `notFound()` y no un redirect: con el id de un alumno de OTRA organización (o fuera
 * del scope), `getStudent` devuelve null y respondemos 404. Un redirect confirmaría que
 * existe. El alumno se resuelve PRIMERO: las demás lecturas asumen que está en scope
 * (una de ellas tiraría con un id ajeno, y eso sería un 500 en vez de este 404).
 */
export default async function StudentPage({ params }: Params) {
  const { id } = await params;
  const session = await requireSession();
  const orgId = session.activeOrgId!;

  // La membresía revalidada trae el ROL: editar montos y exonerar es de owner/admin, y lo
  // que un rol no puede hacer no se le muestra (§4.3) — el server lo valida igual.
  const { actor, scope } = await requireScopedMember(orgId);
  const student = await getStudent(orgId, scope, id);
  if (!student) notFound();

  const [enrollments, charges, payments, context, groups, settings, shellOrg] = await Promise.all([
    listEnrollmentsForStudent(orgId, scope, id),
    listChargesForStudent(orgId, scope, id),
    listPaymentsForStudent(orgId, scope, id),
    paymentContext(orgId, scope, id),
    listGroups(orgId, scope),
    getOrgSettings(orgId),
    getShellOrganization(orgId),
  ]);

  const today = todayInTz(settings?.timezone ?? "");
  const timezone = settings?.timezone ?? "";

  // S9: el sheet de pago pregunta "¿qué profe cobró?" solo a owner/admin de un estudio.
  const teachers =
    shellOrg?.type === "STUDIO" && can(actor, "org:viewAll")
      ? await listTeacherOptions(orgId)
      : [];

  // El recordatorio de la ficha habla del período EN CURSO (el de Deudores, del período
  // visible). buildReminder trae mensaje + deuda; el link wa.me se arma acá, server-side.
  const period = periodOf(today);
  const [reminderDraft, reminderHistory] = await Promise.all([
    buildReminder(orgId, scope, id, period),
    listRemindersForStudent(orgId, scope, id, timezone),
  ]);
  const waUrl =
    reminderDraft.student.phone && reminderDraft.debt > 0
      ? waLink(reminderDraft.student.phone, reminderDraft.message)
      : null;

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
              teachers={teachers}
            />
            <RemindersCard
              studentId={student.id}
              waUrl={waUrl}
              hasDebt={reminderDraft.debt > 0}
              emailConfigured={isEmailConfigured()}
              hasEmail={Boolean(student.email)}
              history={reminderHistory}
            />
          </>
        }
      />
    </>
  );
}
