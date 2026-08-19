import type { Metadata } from "next";
import { CalendarPlus } from "lucide-react";

import { MetricCard } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatFullDayDate, formatMoney, formatPeriod } from "@/lib/format";
import { requireScopedMember } from "@/server/authz";
import { getShellOrganization } from "@/server/organizations";
import { listGroups } from "@/server/services/groups";
import { dashboardMetrics } from "@/server/services/metrics";
import { can } from "@/server/services/permissions";

import { AppBar } from "../_components/app-bar";
import { EmptyState } from "../_components/empty-state";
import { TodayClasses } from "./_components/today-classes";

export const metadata: Metadata = {
  title: "Inicio",
};

/**
 * Inicio (HU7.1): cómo viene el mes de un vistazo — cobrado, pendiente, deudores y las
 * clases de hoy. Los números salen de `services/metrics.ts` (la vara de S4/S5: las cards
 * cuadran con Cobranzas por construcción) y cada card navega a su detalle. Las tres de
 * plata caen en Cobranzas del período en curso (la pantalla de la plata en Fase 1); las
 * clases, en la vista día de la agenda.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const orgId = session.activeOrgId!;

  const [org, { actor, scope }] = await Promise.all([
    getShellOrganization(orgId),
    requireScopedMember(orgId),
  ]);

  // Vacío = sin grupos EN EL SCOPE (ni inactivos). Para la dueña es la org recién
  // creada (guía de arranque); para un teacher (S7) es "todavía no te asignaron nada".
  const groups = await listGroups(orgId, scope, { includeInactive: true });

  if (groups.length === 0) {
    const manage = can(actor, "org:viewAll");
    return (
      <>
        <AppBar title={org?.name ?? "Inicio"} />

        <EmptyState
          icon={CalendarPlus}
          title={manage ? "Empecemos por tu primer grupo" : "Tu tablero está en camino"}
          description={
            manage
              ? "Un grupo es una clase con su horario y su disciplina. Después sumás alumnos y los inscribís: la agenda, las cuotas y este tablero se llenan solos."
              : "Cuando te asignen un grupo vas a ver acá tus clases, tus alumnos y tus cobranzas."
          }
          // `?nuevo=grupo` abre el alta directo (S2): un tap menos que aterrizar en la agenda.
          cta={manage ? { label: "Creá tu primer grupo", href: "/agenda?nuevo=grupo" } : undefined}
        />
      </>
    );
  }

  const metrics = await dashboardMetrics(orgId, scope);
  const periodLabel = formatPeriod(metrics.period).toLowerCase();

  return (
    <>
      <AppBar title={org?.name ?? "Inicio"} />

      <div className="flex flex-col gap-4 px-4 pt-2 pb-6 md:px-6">
        <section aria-label="Cómo viene el mes" className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <MetricCard
            href="/cobranzas"
            label={`Cobrado en ${periodLabel}`}
            value={formatMoney(metrics.collected)}
            className="col-span-2 md:col-span-1"
          />
          <MetricCard
            href="/cobranzas"
            label="Pendiente de cobro"
            value={formatMoney(metrics.pending)}
            context={
              metrics.pendingCharges === 1
                ? "1 cuota impaga"
                : `${metrics.pendingCharges} cuotas impagas`
            }
          />
          <MetricCard
            href="/cobranzas"
            label="Deudores"
            value={String(metrics.debtors)}
            context={metrics.debtors === 1 ? "alumno con deuda" : "alumnos con deuda"}
          />
        </section>

        <section aria-label="Clases de hoy" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-text">Clases de hoy</h2>
            <span className="text-xs text-text-secondary">{formatFullDayDate(metrics.today)}</span>
          </div>

          <TodayClasses
            classes={metrics.todayClasses.map((occurrence) => ({
              slotId: occurrence.slotId,
              originalDate: occurrence.originalDate,
              startTime: occurrence.startTime,
              groupName: occurrence.groupName,
              status: occurrence.status,
              moved: occurrence.moved,
              colorIndex: occurrence.colorIndex,
            }))}
            today={metrics.today}
            dateLabel={formatFullDayDate(metrics.today)}
          />
        </section>
      </div>
    </>
  );
}
