import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { addMonths, DEFAULT_TIMEZONE, isPeriod, periodOf, todayInTz } from "@/lib/dates";
import { requireScopedMember } from "@/server/authz";
import { getOrgSettings, getShellOrganization } from "@/server/organizations";
import { can } from "@/server/services/permissions";
import { settlementOverview, teacherSettlements } from "@/server/services/settlements";

import { AppBar } from "../../_components/app-bar";
import { LiquidacionesAdmin, LiquidacionesMine } from "./_components/liquidaciones-screen";

export const metadata: Metadata = {
  title: "Liquidaciones",
};

/**
 * Liquidaciones (S9, F3): solo STUDIO. Owner/admin ven el período completo por profe
 * (default: el período ANTERIOR — el cerrable); una profe STAFF ve LA SUYA (HU6.4,
 * settlements:viewOwn + scope S7) con el borrador del mes y su historial. Todos los
 * números salen del MISMO servicio que prueban los tests — la pantalla no suma nada.
 */
export default async function LiquidacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const org = await getShellOrganization(session.activeOrgId!);

  if (org?.type !== "STUDIO") notFound();

  const { actor, scope } = await requireScopedMember(session.activeOrgId!);
  const settings = await getOrgSettings(actor.orgId);
  const today = todayInTz(settings?.timezone ?? DEFAULT_TIMEZONE);
  const currentPeriod = periodOf(today);

  // La vista del profe (HU6.4): sus liquidaciones, y nada más.
  if (!can(actor, "settlements:manage")) {
    if (scope.kind !== "teacher" || !scope.teacherProfileId) notFound();
    const mine = await teacherSettlements(actor.orgId, scope);
    if (!mine.current && mine.history.length === 0) notFound();

    return (
      <>
        <AppBar title="Mis liquidaciones" back="/estudio" />
        <LiquidacionesMine current={mine.current} history={mine.history} period={currentPeriod} />
      </>
    );
  }

  const params = await searchParams;
  const raw = Array.isArray(params.periodo) ? params.periodo[0] : params.periodo;
  // F3: se entra por el período ANTERIOR — el que se puede cerrar.
  const period = raw && isPeriod(raw) ? raw : addMonths(currentPeriod, -1);

  const overview = await settlementOverview(actor, period);

  return (
    <>
      <AppBar title="Liquidaciones" back="/estudio" />
      <LiquidacionesAdmin overview={overview} currentPeriod={currentPeriod} />
    </>
  );
}
