"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_REMINDER_TEMPLATE,
  defaultReminderTemplate,
  REMINDER_VARIABLES,
  renderTemplate,
} from "@/lib/reminders";

import { updateBillingSettingsAction } from "../actions";
import type { BillingSettingsFormState } from "../schema";

/**
 * Ajustes de cobranzas (S5, §3.16): alias de cobro y plantilla de recordatorio, con la
 * vista previa renderizada EN VIVO — el profe ve el mensaje exacto que va a salir,
 * variables resueltas con datos reales de su org. Solo la ven owner/admin (§4.3).
 */
export function BillingSettingsCard({
  initialAlias,
  initialTemplate,
  preview,
}: {
  initialAlias: string;
  initialTemplate: string;
  /** Datos reales para la vista previa: un deudor del período en curso, o el ejemplo. */
  preview: { nombre: string; periodo: string; monto: string };
}) {
  const toast = useToast();
  const [alias, setAlias] = useState(initialAlias);
  const [template, setTemplate] = useState(initialTemplate);
  const [errors, setErrors] = useState<NonNullable<BillingSettingsFormState["errors"]>>({});
  const [saving, startSave] = useTransition();

  // El default depende del alias: sin alias, la frase de la transferencia no existe
  // (nunca se ve "Podés transferir a ." — ni acá ni en el mensaje real).
  const rendered = renderTemplate(template.trim() || defaultReminderTemplate(alias), {
    ...preview,
    alias: alias.trim(),
  });

  const save = () => {
    setErrors({});
    startSave(async () => {
      let state: BillingSettingsFormState;
      try {
        state = await updateBillingSettingsAction({
          paymentAlias: alias,
          reminderTemplate: template,
        });
      } catch {
        toast.error("No se pudo guardar. Actualizá y probá de nuevo.");
        return;
      }
      if (state.errors || state.formError) {
        setErrors(state.errors ?? {});
        if (state.formError) toast.error(state.formError);
        return;
      }
      toast.notify("Ajustes guardados.");
    });
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-text">Cobranzas</h2>
        <p className="text-sm text-text-secondary">
          El alias y el mensaje con el que salen tus recordatorios.
        </p>
      </div>

      <Field
        label="Alias o CBU de cobro"
        helpText="Es lo que pone {alias} en el mensaje."
        error={errors.paymentAlias}
      >
        <Input
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
          placeholder="estudio.luna"
          autoComplete="off"
        />
      </Field>

      <Field
        label="Plantilla de recordatorio"
        helpText={`Vacía, se usa el mensaje de siempre. Variables: ${REMINDER_VARIABLES.map((v) => `{${v.name}} = ${v.hint}`).join(" · ")}`}
        error={errors.reminderTemplate}
      >
        <Textarea
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          placeholder={DEFAULT_REMINDER_TEMPLATE}
          rows={4}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Vista previa</span>
        <p className="rounded-card border border-border bg-background p-3 text-sm text-text">
          {rendered}
        </p>
      </div>

      <Button size="lg" loading={saving} onClick={save}>
        Guardar cambios
      </Button>
    </Card>
  );
}
