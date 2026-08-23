"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatListDate } from "@/lib/format";
import type { AgreementListItem } from "@/server/services/agreements";

import { listAgreementsAction, setAgreementAction } from "../../actions";

/**
 * El acuerdo económico de una profe STAFF (S9, HU6.1): porcentaje del estudio con
 * vigencia. CAMBIAR crea un registro nuevo — el historial queda a la vista y cada pago
 * liquida con el acuerdo vigente a su fecha (RN6-bis). Sin default: sin acuerdo no hay
 * liquidación posible, y esta pantalla lo pide, no lo inventa.
 */
export function AgreementSheet({
  open,
  onOpenChange,
  teacher,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacher: { id: string; displayName: string } | null;
  /** Hoy en la zona de la org: el default de la vigencia. */
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [history, setHistory] = useState<AgreementListItem[] | null>(null);
  const [percent, setPercent] = useState("");
  const [validFrom, setValidFrom] = useState(today);
  const [percentError, setPercentError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const teacherId = teacher?.id ?? null;
  useEffect(() => {
    if (!open || !teacherId) return;
    let alive = true;
    listAgreementsAction(teacherId)
      .then((result) => {
        if (alive && Array.isArray(result)) setHistory(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, teacherId]);

  if (!teacher) return null;

  const handleSave = () => {
    const parsed = Number(percent.replace(",", "."));
    startSave(async () => {
      setPercentError(null);
      setDateError(null);
      const result = await setAgreementAction({
        teacherId: teacher.id,
        studioPercent: percent.trim() === "" || Number.isNaN(parsed) ? null : parsed,
        validFrom,
      });
      if (result.error) {
        if (result.field === "validFrom") setDateError(result.error);
        else setPercentError(result.error);
        return;
      }
      onOpenChange(false);
      toast.notify(`Acuerdo de ${teacher.displayName}: el estudio retiene ${parsed}%.`);
      router.refresh();
    });
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Acuerdo de ${teacher.displayName}`}
      description="El porcentaje que retiene el estudio de lo cobrado por sus clases (RN6)."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ActionSheetBody className="flex flex-col gap-4 py-4">
          <Field
            label="Retención del estudio (%)"
            error={percentError ?? undefined}
            helpText="Ejemplo: 30 = el estudio retiene el 30% y la profe cobra el 70%."
          >
            <Input
              inputMode="decimal"
              placeholder="30"
              value={percent}
              className="font-display tabular-nums"
              onChange={(event) => {
                setPercent(event.target.value);
                if (percentError) setPercentError(null);
              }}
            />
          </Field>

          <Field
            label="Rige desde"
            error={dateError ?? undefined}
            helpText="Cada pago liquida con el acuerdo vigente a su fecha: un cambio a mitad de mes parte el cálculo en dos."
          >
            <Input
              type="date"
              value={validFrom}
              className="font-display tabular-nums"
              onChange={(event) => {
                setValidFrom(event.target.value);
                if (dateError) setDateError(null);
              }}
            />
          </Field>

          {history && history.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">Historial</span>
              <ul className="flex flex-col gap-1">
                {history.map((agreement) => (
                  <li
                    key={agreement.id}
                    className="flex items-baseline justify-between rounded-card bg-muted px-3 py-2 text-sm"
                  >
                    <span className="font-display tabular-nums text-text">
                      {agreement.studioPercent}%
                    </span>
                    <span className="text-xs text-text-secondary">
                      desde el {formatListDate(agreement.validFrom)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">
              Todavía sin acuerdo: hasta definirlo, su liquidación no se puede calcular.
            </p>
          )}
        </ActionSheetBody>
        <ActionSheetFooter>
          <Button type="submit" size="lg" loading={saving}>
            Guardar acuerdo
          </Button>
        </ActionSheetFooter>
      </form>
    </ActionSheet>
  );
}
