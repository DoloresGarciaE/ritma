import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { periodOf, todayInTz } from "@/lib/dates";
import { formatMoney, formatPeriod } from "@/lib/format";
import { firstNameOf } from "@/lib/reminders";
import { requireMember } from "@/server/authz";
import { getDisciplines, getOrgSettings, getShellOrganization } from "@/server/organizations";
import { debtorsForPeriod } from "@/server/services/charges";
import { can } from "@/server/services/permissions";

import { AppBar } from "../_components/app-bar";
import { BillingSettingsCard } from "./_components/billing-settings-card";

export const metadata: Metadata = {
  title: "Ajustes",
};

/**
 * Ajustes. Desde S5, la sección de cobranzas (alias + plantilla de recordatorio) es lo
 * primero editable; el resto sigue siendo la foto de los defaults de HU1.2. La card de
 * cobranzas es de owner/admin: a un teacher no se le muestra (§4.3) y la action valida
 * el rol igual.
 */
export default async function AjustesPage() {
  const session = await requireSession();
  const orgId = session.activeOrgId!;

  const [actor, org, disciplines, settings] = await Promise.all([
    requireMember(orgId),
    getShellOrganization(orgId),
    getDisciplines(orgId),
    getOrgSettings(orgId),
  ]);

  const canConfigure = can(actor, "org:configure");

  // Vista previa con datos reales: el primer deudor del período en curso; sin deudores,
  // el ejemplo canónico de Marca §4.2.
  const period = periodOf(todayInTz(settings?.timezone ?? ""));
  let preview = { nombre: "Sofía", periodo: formatPeriod(period), monto: "$20.000" };
  if (canConfigure) {
    const { students } = await debtorsForPeriod(orgId, period);
    const first = students[0];
    if (first) {
      preview = {
        nombre: firstNameOf(first.student.name),
        periodo: formatPeriod(period),
        monto: formatMoney(first.total),
      };
    }
  }

  return (
    <>
      <AppBar title="Ajustes" back="/mas" />

      <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-text">{org?.name}</h2>
          <dl className="flex flex-col gap-2 text-sm">
            {[
              ["Tipo", org?.type === "STUDIO" ? "Estudio" : "Trabajo por mi cuenta"],
              ["Moneda", "ARS"],
              ["Vencimiento de las cuotas", "Día 10 de cada mes"],
              ["Zona horaria", "Buenos Aires"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="text-text-secondary">{label}</dt>
                <dd className="text-right text-text">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {canConfigure ? (
          <BillingSettingsCard
            initialAlias={settings?.paymentAlias ?? ""}
            initialTemplate={settings?.reminderTemplate ?? ""}
            preview={preview}
          />
        ) : null}

        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-text">Disciplinas</h2>
          <ul className="flex flex-wrap gap-2">
            {disciplines.map((discipline) => (
              <li
                key={discipline.id}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-text-secondary"
              >
                {discipline.name}
              </li>
            ))}
          </ul>
        </Card>

        <p className="text-xs text-text-secondary">
          El resto es solo lectura por ahora. Vas a poder editarlo más adelante.
        </p>
      </div>
    </>
  );
}
