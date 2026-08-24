import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { addMonths, DEFAULT_TIMEZONE, isPeriod, periodOf, todayInTz } from "@/lib/dates";
import { requireScopedMember } from "@/server/authz";
import { getOrgSettings, getShellOrganization } from "@/server/organizations";
import { can } from "@/server/services/permissions";
import { rentalsOverview } from "@/server/services/rentals";

import { AppBar } from "../../_components/app-bar";
import { AlquileresScreen } from "./_components/alquileres-screen";

export const metadata: Metadata = {
  title: "Alquileres",
};

/**
 * Alquileres de externos (S10, HU6.3): solo STUDIO y solo owner/admin — un teacher ni
 * confirma que existe (404, §4.3). Default: el período ANTERIOR, donde aterrizan los
 * cargos por sesión/hora recién generados; el fijo mensual vive en el período en curso.
 */
export default async function AlquileresPage({
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
  const period = raw && isPeriod(raw) ? raw : addMonths(currentPeriod, -1);

  const overview = await rentalsOverview(actor, period);

  return (
    <>
      <AppBar title="Alquileres" back="/estudio" />
      <AlquileresScreen overview={overview} currentPeriod={currentPeriod} today={today} />
    </>
  );
}
