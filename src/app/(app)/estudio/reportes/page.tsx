import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { DEFAULT_TIMEZONE, isPeriod, periodOf, todayInTz } from "@/lib/dates";
import { requireScopedMember } from "@/server/authz";
import { getOrgSettings, getShellOrganization } from "@/server/organizations";
import { periodRevenue } from "@/server/services/metrics";
import { can } from "@/server/services/permissions";

import { AppBar } from "../../_components/app-bar";
import { ReportesScreen } from "./_components/reportes-screen";

export const metadata: Metadata = {
  title: "Reportes",
};

/**
 * Reportes del estudio (S10, HU7.2): ingresos por profe y por disciplina del período,
 * con la MISMA vara que el dashboard (imputaciones del período, S6) y la línea de
 * alquileres cobrados. Solo STUDIO y solo owner/admin (404, §4.3). Default: el período
 * EN CURSO — el mismo que mira el Inicio, así cuadran a simple vista.
 */
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const org = await getShellOrganization(session.activeOrgId!);

  if (org?.type !== "STUDIO") notFound();

  const { actor } = await requireScopedMember(session.activeOrgId!);
  if (!can(actor, "settlements:manage")) notFound();

  const settings = await getOrgSettings(actor.orgId);
  const today = todayInTz(settings?.timezone ?? DEFAULT_TIMEZONE);
  const currentPeriod = periodOf(today);

  const params = await searchParams;
  const raw = Array.isArray(params.periodo) ? params.periodo[0] : params.periodo;
  const period = raw && isPeriod(raw) ? raw : currentPeriod;

  const revenue = await periodRevenue(actor.orgId, period);

  return (
    <>
      <AppBar title="Reportes" back="/estudio" />
      <ReportesScreen revenue={revenue} currentPeriod={currentPeriod} />
    </>
  );
}
