import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { addMonths, DEFAULT_TIMEZONE, isPeriod, periodOf, todayInTz } from "@/lib/dates";
import { formatMoney, formatPeriod } from "@/lib/format";
import { isR2Configured } from "@/lib/r2";
import { defaultReminderTemplate, firstNameOf, renderTemplate } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp";
import { requireScopedMember } from "@/server/authz";
import { getOrgSettings, getShellOrganization, listTeacherOptions } from "@/server/organizations";
import { debtorsForPeriod } from "@/server/services/charges";
import { listGroups } from "@/server/services/groups";
import { can } from "@/server/services/permissions";

import { AppBar } from "../_components/app-bar";
import { EmptyState } from "../_components/empty-state";
import { DebtorsList } from "./_components/debtors-list";

export const metadata: Metadata = {
  title: "Cobranzas",
};

/**
 * Cobranzas (S3): los deudores del período — una fila por cuota impaga, con alumno,
 * grupo, badge §3.3 y monto; arriba, el total adeudado. Server-first como la agenda:
 * `?periodo=YYYY-MM` y `?grupo=<id>` viven en la URL (params inválidos caen en silencio
 * al período actual / sin filtro). Desde S4, "Registrar pago" en la fila; desde S5, el
 * WhatsApp del recordatorio (HU5.2) con la plantilla renderizada.
 */
export default async function CobranzasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const orgId = session.activeOrgId!;
  const params = await searchParams;

  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const [{ actor, scope }, settings, shellOrg] = await Promise.all([
    requireScopedMember(orgId),
    getOrgSettings(orgId),
    getShellOrganization(orgId),
  ]);
  const groups = await listGroups(orgId, scope);
  // S9: el sheet de pago pregunta "¿qué profe cobró?" solo a owner/admin de un estudio
  // (un teacher se auto-atribuye en el server).
  const teachers =
    shellOrg?.type === "STUDIO" && can(actor, "org:viewAll")
      ? await listTeacherOptions(orgId)
      : [];
  const today = todayInTz(settings?.timezone ?? DEFAULT_TIMEZONE);
  const currentPeriod = periodOf(today);

  const periodoParam = first(params.periodo);
  const period = periodoParam && isPeriod(periodoParam) ? periodoParam : currentPeriod;

  const grupoParam = first(params.grupo);
  const groupId = groups.some((g) => g.id === grupoParam) ? grupoParam : undefined;

  const { total, debtors, students } = await debtorsForPeriod(orgId, scope, period, { groupId });

  // El recordatorio de cada alumno (HU5.2): la plantilla de la org renderizada con la
  // deuda del PERÍODO COMPLETO (§3.16 define {monto} así — con el filtro de grupo
  // activo, el mensaje NO subdeclara la deuda; para un teacher, S7, "período completo"
  // es su scope: la deuda del período CON ÉL) y el link wa.me armado acá en el server.
  // El log se registra recién al tocar (F2 paso 3).
  const { students: periodStudents } = groupId
    ? await debtorsForPeriod(orgId, scope, period)
    : { students };
  const alias = settings?.paymentAlias ?? "";
  const template = settings?.reminderTemplate ?? defaultReminderTemplate(alias);
  const reminders = Object.fromEntries(
    periodStudents.map(({ student, total: debt }) => [
      student.id,
      student.phone
        ? waLink(
            student.phone,
            renderTemplate(template, {
              nombre: firstNameOf(student.name),
              periodo: formatPeriod(period),
              monto: formatMoney(debt),
              alias,
            }),
          )
        : null,
    ]),
  );

  const href = (p: string, g: string | undefined = groupId) => {
    const query = new URLSearchParams();
    if (p !== currentPeriod) query.set("periodo", p);
    if (g) query.set("grupo", g);
    const qs = query.toString();
    return qs ? `/cobranzas?${qs}` : "/cobranzas";
  };

  const chipStyles = (selected: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
      selected
        ? "border-primary bg-nav-active-bg text-nav-active-text"
        : "border-border-strong bg-surface text-text hover:bg-muted",
    );

  return (
    <>
      <AppBar title="Cobranzas" />

      <div className="flex flex-col gap-3 px-4 pt-2 pb-6 md:px-6">
        {/* ‹ Período › — el estado vive en la URL, como la agenda. */}
        <nav aria-label="Cambiar de período" className="flex items-center gap-2">
          <Link
            href={href(addMonths(period, -1))}
            aria-label="Período anterior"
            className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </Link>

          <span className="min-w-0 flex-1 truncate text-center font-display text-sm font-medium text-text">
            {formatPeriod(period)}
          </span>

          <Link
            href={href(addMonths(period, 1))}
            aria-label="Período siguiente"
            className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
          >
            <ChevronRight aria-hidden className="size-5" />
          </Link>

          {period !== currentPeriod ? (
            <Link
              href={href(currentPeriod)}
              className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-primary hover:bg-muted"
            >
              Este mes
            </Link>
          ) : null}
        </nav>

        {/* Filtro por grupo: chips-link. "Todos" = sin filtro. */}
        {groups.length > 1 ? (
          <div
            role="group"
            aria-label="Filtrar por grupo"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            <Link
              href={href(period, undefined)}
              aria-current={!groupId ? "true" : undefined}
              className={chipStyles(!groupId)}
            >
              Todos
            </Link>
            {groups.map((group) => (
              <Link
                key={group.id}
                href={href(period, group.id)}
                aria-current={groupId === group.id ? "true" : undefined}
                className={chipStyles(groupId === group.id)}
              >
                {group.name}
              </Link>
            ))}
          </div>
        ) : null}

        {debtors.length === 0 ? (
          <EmptyState
            icon={PartyPopper}
            title="Nada por cobrar"
            description={`Las cuotas de ${formatPeriod(period).toLowerCase()} están al día. Cuando haya deuda, la vas a ver acá.`}
          />
        ) : (
          <>
            {/* El total adeudado del período, arriba de la lista. */}
            <Card className="flex flex-col gap-0.5">
              <span className="text-xs text-text-secondary">
                Por cobrar en {formatPeriod(period).toLowerCase()}
                {groupId ? ` · ${groups.find((g) => g.id === groupId)?.name}` : ""}
              </span>
              <span className="font-display text-2xl font-medium text-text tabular-nums">
                {formatMoney(total)}
              </span>
              <span className="text-xs text-text-secondary">
                {debtors.length === 1 ? "1 cuota impaga" : `${debtors.length} cuotas impagas`}
              </span>
            </Card>

            {/* Una fila por CUOTA con lo que FALTA; "Registrar pago" (15 s, HU4.3) y
                el WhatsApp del recordatorio (HU5.2) — nota S5 en §3.5. */}
            <DebtorsList
              debtors={debtors}
              reminders={reminders}
              isStudio={shellOrg?.type === "STUDIO"}
              attachmentsEnabled={isR2Configured()}
              today={today}
              teachers={teachers}
            />
          </>
        )}
      </div>
    </>
  );
}
