"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AmountInput, Field } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatListDate, formatMoney, formatPeriod } from "@/lib/format";
import type { ChargeListItem } from "@/server/services/charges";

import type { PaymentListItem } from "@/server/services/payments";

import { updateChargeAmountAction, waiveChargeAction } from "../../../cobranzas/actions";
import { PaymentDetailSheet } from "../../../cobranzas/_components/payment-detail-sheet";
import { PaymentSheet } from "../../../cobranzas/_components/payment-sheet";

/**
 * Estado de cuenta (S3 + S4): cuotas y pagos INTERCALADOS por fecha, con el saldo a
 * favor visible cuando existe. Cuotas con el badge §3.3; pagos con etiqueta de texto
 * (el color nunca comunica solo). Registrar pago abre el sheet de HU4.3; cada pago abre
 * su detalle (imputaciones, comprobante, eliminar — RN12). Editar monto y exonerar
 * siguen siendo de owner/admin (§4.3) — a un teacher las cuotas ni se le tocan.
 */

const EDITABLE: ChargeListItem["status"][] = ["PENDING", "OVERDUE"];

const METHOD_LABEL: Record<PaymentListItem["method"], string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

type Entry =
  | { kind: "charge"; date: string; charge: ChargeListItem }
  | { kind: "payment"; date: string; payment: PaymentListItem };

export function AccountStatementCard({
  studentId,
  studentName,
  charges,
  payments,
  credit,
  canManage,
  isStudio,
  attachmentsEnabled,
  today,
  teachers = [],
}: {
  studentId: string;
  studentName: string;
  charges: ChargeListItem[];
  payments: PaymentListItem[];
  /** Saldo a favor (pagos − imputaciones), ya derivado en el server. */
  credit: number;
  /** owner/admin (Plan §4): habilita editar monto y exonerar. */
  canManage: boolean;
  isStudio: boolean;
  attachmentsEnabled: boolean;
  /** Hoy en la zona de la org. */
  today: string;
  /** S9: opciones "¿qué profe cobró?" del sheet (solo owner/admin de un STUDIO). */
  teachers?: { id: string; displayName: string }[];
}) {
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [waiving, startWaive] = useTransition();

  const [selected, setSelected] = useState<ChargeListItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [confirmWaive, setConfirmWaive] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payKey, setPayKey] = useState(0);
  const [detailPayment, setDetailPayment] = useState<PaymentListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openPay = () => {
    toast.closeAll();
    setPayKey((key) => key + 1);
    setPayOpen(true);
  };

  const openPaymentDetail = (payment: PaymentListItem) => {
    toast.closeAll();
    setDetailPayment(payment);
    setDetailOpen(true);
  };

  // Cuotas (por vencimiento) y pagos (por fecha de pago) en UNA línea de tiempo, lo más
  // nuevo arriba; a igual fecha, el pago primero (es la actividad más reciente).
  const entries: Entry[] = [
    ...charges.map((charge): Entry => ({ kind: "charge", date: charge.dueDate, charge })),
    ...payments.map((payment): Entry => ({ kind: "payment", date: payment.paidAt, payment })),
  ].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === "payment" ? -1 : 1),
  );

  const openCharge = (charge: ChargeListItem) => {
    toast.closeAll();
    setSelected(charge);
    setAmount(charge.amount);
    setAmountError(null);
    setConfirmWaive(false);
    setSheetOpen(true);
  };

  const failedToast = () =>
    toast.error("No se pudo guardar. La cuota puede haber cambiado: actualizá y probá de nuevo.");

  const handleSaveAmount = () => {
    if (!selected) return;
    startSave(async () => {
      let state;
      try {
        state = await updateChargeAmountAction({ chargeId: selected.id, amount, studentId });
      } catch {
        setSheetOpen(false);
        failedToast();
        return;
      }

      if (state.errors?.amount) {
        setAmountError(state.errors.amount);
        return;
      }
      if (state.formError) {
        setSheetOpen(false);
        toast.error(state.formError);
        return;
      }

      setSheetOpen(false);
      toast.notify(
        `La cuota de ${formatPeriod(selected.period)} quedó en ${formatMoney(amount ?? 0)}.`,
      );
    });
  };

  const handleWaive = () => {
    if (!selected) return;
    startWaive(async () => {
      let state;
      try {
        state = await waiveChargeAction({ chargeId: selected.id, studentId });
      } catch {
        setConfirmWaive(false);
        setSheetOpen(false);
        failedToast();
        return;
      }

      setConfirmWaive(false);
      setSheetOpen(false);

      if (state.formError) {
        toast.error(state.formError);
        return;
      }
      toast.notify(`Exoneraste la cuota de ${formatPeriod(selected.period)}.`);
    });
  };

  const editable = selected ? EDITABLE.includes(selected.status) : false;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-text">Estado de cuenta</h3>
        {credit > 0 ? (
          <span className="text-sm font-medium text-success">
            Saldo a favor: <span className="font-display tabular-nums">{formatMoney(credit)}</span>
          </span>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Sin movimientos todavía. Las cuotas se generan solas al inscribirlo en un grupo.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {entries.map((entry) => {
            if (entry.kind === "payment") {
              const { payment } = entry;
              return (
                <li key={`pago-${payment.id}`}>
                  <button
                    type="button"
                    onClick={() => openPaymentDetail(payment)}
                    className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 py-2 text-left"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-text">
                        Pago · {METHOD_LABEL[payment.method]}
                      </span>
                      <span className="truncate text-xs text-text-secondary">
                        {formatListDate(payment.paidAt)}
                        {payment.allocations.length === 0 ? " · quedó a favor" : ""}
                        {payment.hasAttachment ? " · con comprobante" : ""}
                      </span>
                    </div>
                    <span className="shrink-0 font-display text-sm font-medium text-success tabular-nums">
                      {formatMoney(payment.amount)}
                    </span>
                  </button>
                </li>
              );
            }

            const { charge } = entry;
            const row = (
              <>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-text">
                    {formatPeriod(charge.period)}
                  </span>
                  <span className="truncate text-xs text-text-secondary">
                    {charge.group.name}
                    {charge.plan === "DROP_IN" ? " · Clase suelta" : ""} · vence{" "}
                    {formatListDate(charge.dueDate)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-display text-sm font-medium text-text tabular-nums">
                    {formatMoney(charge.amount)}
                  </span>
                  <StatusBadge status={charge.status} />
                </div>
              </>
            );

            return (
              <li key={charge.id}>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => openCharge(charge)}
                    className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 py-2 text-left"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex min-h-14 items-center justify-between gap-3 py-2">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Button variant="secondary" size="lg" className="w-full" onClick={openPay}>
        Registrar pago
      </Button>

      <PaymentSheet
        key={payKey}
        open={payOpen}
        onOpenChange={setPayOpen}
        student={{ id: studentId, name: studentName }}
        isStudio={isStudio}
        attachmentsEnabled={attachmentsEnabled}
        today={today}
        teachers={teachers}
      />

      <PaymentDetailSheet
        key={detailPayment ? `detalle-${detailPayment.id}` : "sin-pago"}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        payment={detailPayment}
        student={{ id: studentId, name: studentName }}
        isStudio={isStudio}
      />

      {/* El detalle de la cuota: monto editable (RN2) y exoneración (RN3). */}
      <ActionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={selected ? `Cuota de ${formatPeriod(selected.period)}` : ""}
        description={
          selected
            ? `${selected.group.name} · vence ${formatListDate(selected.dueDate)} · ${studentName}`
            : undefined
        }
      >
        <ActionSheetBody className="flex flex-col gap-4 pb-4">
          {selected ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Estado</span>
              <StatusBadge status={selected.status} />
            </div>
          ) : null}

          <Field
            label="Monto"
            helpText={
              editable
                ? "El ajuste típico: la primera cuota de un alta a mitad de mes."
                : "Esta cuota ya está cerrada: el monto no se toca."
            }
            error={amountError ?? undefined}
          >
            <AmountInput
              value={amount}
              onValueChange={(value) => {
                setAmount(value);
                setAmountError(null);
              }}
              disabled={!editable}
            />
          </Field>

          {editable ? (
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              onClick={() => setConfirmWaive(true)}
            >
              Exonerar cuota
            </Button>
          ) : null}
        </ActionSheetBody>

        {editable ? (
          <ActionSheetFooter>
            <Button size="lg" loading={saving} onClick={handleSaveAmount}>
              Guardar monto
            </Button>
          </ActionSheetFooter>
        ) : null}

        {/* Confirmación §3.8: nombra el objeto y la consecuencia (RN3: cierre sin pago). */}
        <Dialog open={confirmWaive} onOpenChange={setConfirmWaive}>
          <DialogContent className="gap-4 p-4">
            <DialogTitle>
              ¿Exonerar la cuota de {selected ? formatPeriod(selected.period) : ""} de {studentName}
              ?
            </DialogTitle>
            <DialogDescription>
              Queda cerrada sin pago (beca o canje) y deja de contar como deuda.
            </DialogDescription>

            <div className="flex flex-col gap-2">
              <Button
                variant="destructive"
                size="lg"
                className="w-full"
                loading={waiving}
                onClick={handleWaive}
              >
                Exonerar cuota
              </Button>
              <DialogClose
                render={
                  <Button variant="ghost" size="lg" className="w-full">
                    Volver
                  </Button>
                }
              />
            </div>
          </DialogContent>
        </Dialog>
      </ActionSheet>
    </Card>
  );
}
