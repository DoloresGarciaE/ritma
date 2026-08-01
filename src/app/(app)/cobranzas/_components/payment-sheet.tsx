"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AmountInput, Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatListDate, formatMoney, formatPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentContext } from "@/server/services/payments";

import {
  confirmAttachmentAction,
  createPaymentAction,
  paymentContextAction,
  requestAttachmentUploadAction,
} from "../actions";
import type { PaymentFormState } from "../schema";

/**
 * Registrar pago (HU4.3 + HU4.4) — el sheet §3.8 del objetivo de los 15 segundos:
 * abre con el monto PRE-CARGADO con la deuda del alumno, método en un tap, fecha hoy,
 * y la imputación automática VISIBLE (a qué cuotas va la plata, calculado como lo hará
 * el server: antigua-primero). "Editar imputación" (plegado) habilita HU4.4: montos por
 * cuota a mano, validados de nuevo por el motor dentro de la transacción.
 *
 * `receivedBy` solo aparece en un STUDIO (RN5); la foto solo si R2 está configurado.
 * El padre re-montea con `key` en cada apertura; el contexto se busca al montar.
 */

const chipStyles = (selected: boolean) =>
  cn(
    "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
    selected
      ? "border-primary bg-nav-active-bg text-nav-active-text"
      : "border-border-strong bg-surface text-text hover:bg-muted",
  );

const METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "OTHER", label: "Otro" },
] as const;

type MethodValue = (typeof METHODS)[number]["value"];

/** Preview de la imputación automática: SOLO para mostrar (el server decide en Decimal). */
function previewAllocations(context: PaymentContext, amount: number | null) {
  let left = amount ?? 0;
  const rows: { chargeId: string; label: string; sublabel: string; covered: number }[] = [];

  for (const charge of context.openCharges) {
    const covered = Math.max(0, Math.min(charge.remaining, left));
    left -= covered;
    rows.push({
      chargeId: charge.id,
      label: `${formatPeriod(charge.period)} · ${charge.groupName}`,
      sublabel: `vence ${formatListDate(charge.dueDate)} · faltan ${formatMoney(charge.remaining)}`,
      covered,
    });
  }

  return { rows, excess: Math.max(0, left) };
}

export function PaymentSheet({
  open,
  onOpenChange,
  student,
  isStudio,
  attachmentsEnabled,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { id: string; name: string };
  isStudio: boolean;
  attachmentsEnabled: boolean;
  /** Hoy en la zona de la org. */
  today: string;
}) {
  const toast = useToast();
  const [pending, startSubmit] = useTransition();

  const [context, setContext] = useState<PaymentContext | null>(null);
  const [contextError, setContextError] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<MethodValue>("CASH");
  const [receivedBy, setReceivedBy] = useState<"STUDIO" | "TEACHER">("STUDIO");
  const [paidAt, setPaidAt] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAmounts, setManualAmounts] = useState<Record<string, number | null>>({});
  const [errors, setErrors] = useState<NonNullable<PaymentFormState["errors"]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // El contexto (deuda, crédito, cuotas abiertas) se busca al abrir: fresco siempre.
  useEffect(() => {
    let alive = true;
    paymentContextAction(student.id)
      .then((fresh) => {
        if (!alive) return;
        setContext(fresh);
        // HU4.3: el monto llega PRE-CARGADO con la deuda (si la hay).
        setAmount(fresh.debt > 0 ? fresh.debt : null);
      })
      .catch(() => {
        if (alive) setContextError(true);
      });
    return () => {
      alive = false;
    };
  }, [student.id]);

  const preview = context ? previewAllocations(context, amount) : null;

  const openManual = () => {
    if (!preview) return;
    // La edición arranca desde lo que haría la automática: ajustar, no re-tipear.
    setManualAmounts(
      Object.fromEntries(preview.rows.map((row) => [row.chargeId, row.covered || null])),
    );
    setManualOpen(true);
  };

  const handleSubmit = () => {
    if (!context) return;

    const allocations = manualOpen
      ? Object.entries(manualAmounts)
          .filter(([, value]) => value !== null && value > 0)
          .map(([chargeId, value]) => ({ chargeId, amount: value! }))
      : undefined;

    setErrors({});
    setFormError(null);

    startSubmit(async () => {
      let state: Awaited<ReturnType<typeof createPaymentAction>>;
      try {
        state = await createPaymentAction({
          studentId: student.id,
          amount,
          method,
          ...(isStudio ? { receivedBy } : {}),
          paidAt,
          allocations,
        });
      } catch {
        onOpenChange(false);
        toast.error("No se pudo registrar el pago. Actualizá y probá de nuevo.");
        return;
      }

      if (state.errors || state.formError) {
        setErrors(state.errors ?? {});
        setFormError(state.formError ?? null);
        return;
      }

      // El comprobante viaja DESPUÉS del pago: si falla, el pago ya está a salvo.
      let attachmentWarning: string | null = null;
      if (file && state.paymentId) {
        attachmentWarning = await uploadAttachment(state.paymentId, file);
      }

      onOpenChange(false);
      toast.notify("Pago registrado.");
      if (attachmentWarning) {
        toast.error(`El pago se guardó, pero el comprobante no: ${attachmentWarning}`);
      }
    });
  };

  const uploadAttachment = async (paymentId: string, attachment: File): Promise<string | null> => {
    try {
      const request = await requestAttachmentUploadAction({
        paymentId,
        contentType: attachment.type,
        size: attachment.size,
      });
      if ("error" in request) return request.error;

      const put = await fetch(request.url, {
        method: "PUT",
        headers: { "Content-Type": attachment.type },
        body: attachment,
      });
      if (!put.ok) return "la subida falló. Podés reintentarlo desde el detalle del pago.";

      const confirm = await confirmAttachmentAction({ paymentId, studentId: student.id });
      return confirm.error ?? null;
    } catch {
      return "la subida falló. Podés reintentarlo desde el detalle del pago.";
    }
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar pago"
      description={student.name}
    >
      <ActionSheetBody className="flex flex-col gap-4 pb-4">
        {contextError ? (
          <p className="text-sm text-danger">No se pudo cargar la deuda. Cerrá y probá de nuevo.</p>
        ) : context === null ? (
          <p className="text-sm text-text-secondary">Cargando la deuda…</p>
        ) : (
          <>
            <Field
              label="Monto"
              helpText={
                context.credit > 0
                  ? `Tiene ${formatMoney(context.credit)} a favor de pagos anteriores.`
                  : context.debt > 0
                    ? `Deuda total: ${formatMoney(context.debt)}.`
                    : "No debe nada: lo que pagues queda a favor."
              }
              error={errors.amount}
            >
              <AmountInput
                value={amount}
                onValueChange={(value) => {
                  setAmount(value);
                  if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
              />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">Método</span>
              <div className="flex flex-wrap gap-2">
                {METHODS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={method === option.value}
                    onClick={() => setMethod(option.value)}
                    className={chipStyles(method === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {isStudio ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text">Lo recibió</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={receivedBy === "STUDIO"}
                    onClick={() => setReceivedBy("STUDIO")}
                    className={chipStyles(receivedBy === "STUDIO")}
                  >
                    El estudio
                  </button>
                  <button
                    type="button"
                    aria-pressed={receivedBy === "TEACHER"}
                    onClick={() => setReceivedBy("TEACHER")}
                    className={chipStyles(receivedBy === "TEACHER")}
                  >
                    El profe
                  </button>
                </div>
              </div>
            ) : null}

            <Field label="Fecha" error={errors.paidAt}>
              <Input
                type="date"
                value={paidAt}
                className="font-display tabular-nums"
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </Field>

            {attachmentsEnabled ? (
              <Field
                label="Comprobante (opcional)"
                helpText="Foto o captura de la transferencia. Queda guardado en el pago."
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="w-full text-sm text-text-secondary file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-border-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-text"
                />
              </Field>
            ) : null}

            {/* La imputación, VISIBLE (HU4.3): a qué cuotas va la plata, antigua-primero. */}
            {context.openCharges.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text">
                    {manualOpen ? "Imputación (a mano)" : "Se imputa a"}
                  </span>
                  {manualOpen ? (
                    <Button variant="ghost" size="sm" onClick={() => setManualOpen(false)}>
                      Volver a automática
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={openManual}>
                      Editar imputación
                    </Button>
                  )}
                </div>

                <ul className="flex flex-col gap-2">
                  {(preview?.rows ?? []).map((row) => (
                    <li key={row.chargeId} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-text">{row.label}</span>
                        <span className="truncate text-xs text-text-secondary">{row.sublabel}</span>
                      </div>
                      {manualOpen ? (
                        <div className="w-32 shrink-0">
                          <AmountInput
                            aria-label={`Imputar a ${row.label}`}
                            value={manualAmounts[row.chargeId] ?? null}
                            onValueChange={(value) =>
                              setManualAmounts((prev) => ({ ...prev, [row.chargeId]: value }))
                            }
                          />
                        </div>
                      ) : (
                        <span
                          className={cn(
                            "shrink-0 font-display text-sm font-medium tabular-nums",
                            row.covered > 0 ? "text-text" : "text-text-muted",
                          )}
                        >
                          {formatMoney(row.covered)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {!manualOpen && preview && preview.excess > 0 ? (
                  <p className="border-t border-border pt-2 text-xs text-text-secondary">
                    Quedan <span className="tabular-nums">{formatMoney(preview.excess)}</span> a
                    favor: se aplican solos a la próxima cuota.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                Sin cuotas impagas: todo el pago queda a favor y cubre la próxima cuota solo.
              </p>
            )}

            {formError ? <p className="text-sm text-danger">{formError}</p> : null}
          </>
        )}
      </ActionSheetBody>

      <ActionSheetFooter>
        <Button size="lg" loading={pending} disabled={context === null} onClick={handleSubmit}>
          Registrar pago
        </Button>
      </ActionSheetFooter>
    </ActionSheet>
  );
}
