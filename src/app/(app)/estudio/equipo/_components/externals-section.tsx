"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AmountInput, Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatListDate, formatMoney } from "@/lib/format";
import type { RentalAgreementItem } from "@/server/services/agreements";
import type { ExternalProfile } from "@/server/services/team";

import {
  createExternalAction,
  listRentalAgreementsAction,
  renameExternalAction,
  setRentalAgreementAction,
} from "../../actions";

/**
 * Los profes EXTERNOS del estudio (S10, decisión 1): perfil con solo un nombre — sin
 * cuenta, sin invitación (vincularlos es fase 3). Sus grupos son agenda y ocupación
 * (RN13); su plata es el ALQUILER (RN7): el acuerdo con vigencia vive acá, igual que
 * el porcentaje de una staff, y su falta se canta.
 */

export const RENTAL_PERIOD_LABEL = {
  MONTHLY: "por mes",
  PER_SESSION: "por sesión",
  PER_HOUR: "por hora",
} as const;

export function ExternalsSection({
  externals,
  rentalAgreements,
  today,
}: {
  externals: ExternalProfile[];
  /** El acuerdo de alquiler más nuevo por perfil (teacherId → acuerdo). */
  rentalAgreements: Record<string, RentalAgreementItem>;
  /** Hoy en la zona de la org (default de la vigencia). */
  today: string;
}) {
  const [editing, setEditing] = useState<ExternalProfile | null>(null);
  const [creating, setCreating] = useState(false);
  // Remonta el sheet de nombre en cada apertura: estado fresco sin setState en efectos.
  const [nameSheetKey, setNameSheetKey] = useState(0);
  const [agreementFor, setAgreementFor] = useState<{ id: string; displayName: string } | null>(
    null,
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-medium text-text-secondary">Externos · alquilan salón</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setNameSheetKey((key) => key + 1);
            setCreating(true);
          }}
        >
          Agregar
        </Button>
      </div>

      {externals.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-text-secondary">
            Nadie alquila salón todavía. Un externo se agrega con solo su nombre: sus grupos ocupan
            el calendario y su alquiler se genera solo, mes a mes.
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-0 p-0">
          <ul className="flex flex-col">
            {externals.map((external, index) => {
              const agreement = rentalAgreements[external.id];
              return (
                <li
                  key={external.id}
                  className={`flex min-h-16 items-center gap-3 px-4 py-3 ${
                    index > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-text">{external.displayName}</span>
                    <span className="truncate text-xs text-text-secondary">
                      {external.groupCount === 1
                        ? "1 grupo en el calendario"
                        : `${external.groupCount} grupos en el calendario`}
                    </span>
                    <span className="truncate text-xs text-text-secondary">
                      {agreement
                        ? `Alquiler: ${formatMoney(agreement.rentalAmount)} ${RENTAL_PERIOD_LABEL[agreement.rentalPeriod]} · desde el ${formatListDate(agreement.validFrom)}`
                        : "Sin acuerdo: su alquiler no se puede generar"}
                    </span>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setAgreementFor(external)}>
                    Acuerdo
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNameSheetKey((key) => key + 1);
                      setEditing(external);
                    }}
                  >
                    Renombrar
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <ExternalNameSheet
        key={`${editing?.id ?? "nuevo"}-${nameSheetKey}`}
        open={creating || editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreating(false);
            setEditing(null);
          }
        }}
        external={editing}
      />

      <RentalAgreementSheet
        open={agreementFor !== null}
        onOpenChange={(open) => !open && setAgreementFor(null)}
        teacher={agreementFor}
        today={today}
      />
    </section>
  );
}

/** Alta y renombre: el único dato de un externo es su nombre. */
function ExternalNameSheet({
  open,
  onOpenChange,
  external,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  external: ExternalProfile | null;
}) {
  const router = useRouter();
  const toast = useToast();
  // El `key` del caller remonta el sheet en cada apertura: el initializer alcanza.
  const [name, setName] = useState(external?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const handleSave = () => {
    startSave(async () => {
      setError(null);
      const result = external
        ? await renameExternalAction(external.id, name)
        : await createExternalAction(name);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      toast.notify(
        external ? "Nombre actualizado." : `${name.trim()} ya está en el equipo como externo.`,
      );
      router.refresh();
    });
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title={external ? `Renombrar a ${external.displayName}` : "Agregar externo"}
      description={
        external
          ? undefined
          : "Solo el nombre: sin cuenta ni invitación. Sus grupos ocupan el calendario; su alquiler sale del acuerdo."
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ActionSheetBody className="flex flex-col gap-4 py-4">
          <Field label="Nombre" error={error ?? undefined}>
            <Input
              value={name}
              placeholder="Marina Suárez"
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
            />
          </Field>
        </ActionSheetBody>
        <ActionSheetFooter>
          <Button type="submit" size="lg" loading={saving}>
            {external ? "Guardar nombre" : "Agregar externo"}
          </Button>
        </ActionSheetFooter>
      </form>
    </ActionSheet>
  );
}

/**
 * El acuerdo de ALQUILER (RN7): tarifa + modo + vigencia, con historial — la misma
 * mecánica que el porcentaje de S9. El cargo de un período usa el acuerdo vigente al
 * ÚLTIMO día de ese período (decisión S10).
 */
function RentalAgreementSheet({
  open,
  onOpenChange,
  teacher,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacher: { id: string; displayName: string } | null;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [history, setHistory] = useState<RentalAgreementItem[] | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [mode, setMode] = useState<"MONTHLY" | "PER_SESSION" | "PER_HOUR">("PER_SESSION");
  const [validFrom, setValidFrom] = useState(today);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const teacherId = teacher?.id ?? null;
  useEffect(() => {
    if (!open || !teacherId) return;
    let alive = true;
    listRentalAgreementsAction(teacherId)
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
    startSave(async () => {
      setAmountError(null);
      setDateError(null);
      const result = await setRentalAgreementAction({
        teacherId: teacher.id,
        rentalAmount: amount,
        rentalPeriod: mode,
        validFrom,
      });
      if (result.error) {
        if (result.field === "validFrom") setDateError(result.error);
        else setAmountError(result.error);
        return;
      }
      onOpenChange(false);
      toast.notify(
        `Alquiler de ${teacher.displayName}: ${formatMoney(amount ?? 0)} ${RENTAL_PERIOD_LABEL[mode]}.`,
      );
      router.refresh();
    });
  };

  const chip = (selected: boolean) =>
    `flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border px-3 text-sm transition-colors ${
      selected
        ? "border-primary bg-primary/10 font-medium text-primary"
        : "border-border bg-surface text-text hover:bg-muted"
    }`;

  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Alquiler de ${teacher.displayName}`}
      description="Lo que le cobra el estudio por usar el salón (RN7). Cambiarlo crea un acuerdo nuevo: el historial queda."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ActionSheetBody className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">Cómo se calcula</span>
            <div role="group" aria-label="Cómo se calcula" className="flex flex-wrap gap-2">
              {(
                [
                  ["MONTHLY", "Fijo por mes"],
                  ["PER_SESSION", "Por sesión"],
                  ["PER_HOUR", "Por hora"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={chip(mode === value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-secondary">
              Por sesión y por hora cuentan las clases DICTADAS del mes que cierra (las canceladas
              no); el fijo se genera al arrancar cada mes.
            </p>
          </div>

          <Field label="Tarifa" error={amountError ?? undefined}>
            <AmountInput
              value={amount}
              onValueChange={(value) => {
                setAmount(value);
                if (amountError) setAmountError(null);
              }}
            />
          </Field>

          <Field
            label="Rige desde"
            error={dateError ?? undefined}
            helpText="El cargo de cada mes usa el acuerdo vigente al último día de ese mes."
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
                      {formatMoney(agreement.rentalAmount)}{" "}
                      {RENTAL_PERIOD_LABEL[agreement.rentalPeriod]}
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
              Todavía sin acuerdo: hasta definirlo, su alquiler no se puede generar.
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
