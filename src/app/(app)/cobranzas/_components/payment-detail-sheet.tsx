"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionSheet, ActionSheetBody } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatFullDayDate, formatMoney, formatPeriod } from "@/lib/format";
import type { PaymentListItem } from "@/server/services/payments";

import { attachmentViewUrlAction, deletePaymentAction } from "../actions";

/**
 * Detalle de un pago (S4): método, fecha, imputaciones, comprobante si hay, y la
 * eliminación (propuesta RN12) con confirmación §3.8 — nombra monto y alumno, y dice la
 * consecuencia: las cuotas que cubría vuelven a quedar impagas.
 *
 * El comprobante se ve con URL firmada CORTA pedida recién al tocar "Ver comprobante":
 * nada de URLs públicas ni permanentes.
 */

const METHOD_LABEL: Record<PaymentListItem["method"], string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

export function PaymentDetailSheet({
  open,
  onOpenChange,
  payment,
  student,
  isStudio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentListItem | null;
  student: { id: string; name: string };
  isStudio: boolean;
}) {
  const toast = useToast();
  const [deleting, startDelete] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [loadingAttachment, setLoadingAttachment] = useState(false);

  if (!payment) return null;

  const close = () => {
    setConfirmOpen(false);
    setAttachmentUrl(null);
    onOpenChange(false);
  };

  const showAttachment = async () => {
    setLoadingAttachment(true);
    try {
      const result = await attachmentViewUrlAction(payment.id);
      if ("error" in result) toast.error(result.error);
      else setAttachmentUrl(result.url);
    } catch {
      toast.error("No se pudo cargar el comprobante. Probá de nuevo.");
    } finally {
      setLoadingAttachment(false);
    }
  };

  const handleDelete = () => {
    startDelete(async () => {
      try {
        await deletePaymentAction({ paymentId: payment.id, studentId: student.id });
      } catch {
        close();
        toast.error("No se pudo eliminar el pago. Actualizá y probá de nuevo.");
        return;
      }
      close();
      toast.notify("Pago eliminado. Las cuotas volvieron a su estado.");
    });
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(next) : close())}
      title={`Pago de ${formatMoney(payment.amount)}`}
      description={`${METHOD_LABEL[payment.method]} · ${formatFullDayDate(payment.paidAt)} · ${student.name}`}
    >
      <ActionSheetBody className="flex flex-col gap-4 pb-6">
        {isStudio ? (
          <div className="flex items-center justify-between rounded-card border border-border bg-surface p-3">
            <span className="text-sm text-text-secondary">Lo recibió</span>
            <span className="text-sm font-medium text-text">
              {payment.receivedBy === "TEACHER" ? "El profe" : "El estudio"}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
          <span className="text-sm font-medium text-text">Imputado a</span>
          {payment.allocations.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Nada todavía: quedó a favor y cubre la próxima cuota solo.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {payment.allocations.map((allocation) => (
                <li
                  key={allocation.chargeId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-text">
                    {formatPeriod(allocation.period)} · {allocation.groupName}
                  </span>
                  <span className="shrink-0 font-display font-medium text-text tabular-nums">
                    {formatMoney(allocation.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {payment.hasAttachment ? (
          <div className="flex flex-col gap-2">
            {attachmentUrl ? (
              /* URL firmada de 60 s: el optimizador de <Image> la cachearía vencida. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachmentUrl}
                alt={`Comprobante del pago de ${formatMoney(payment.amount)}`}
                className="max-h-96 w-full rounded-card border border-border object-contain"
              />
            ) : (
              <Button
                variant="secondary"
                size="lg"
                loading={loadingAttachment}
                onClick={showAttachment}
              >
                Ver comprobante
              </Button>
            )}
          </div>
        ) : null}

        <Button variant="destructive" size="lg" onClick={() => setConfirmOpen(true)}>
          Eliminar pago
        </Button>
      </ActionSheetBody>

      {/* Confirmación §3.8 (RN12): nombra monto y alumno, y la consecuencia. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>
            ¿Eliminar el pago de {formatMoney(payment.amount)} de {student.name}?
          </DialogTitle>
          <DialogDescription>
            Las cuotas que cubría vuelven a quedar impagas y el comprobante, si hay, se borra. No se
            puede deshacer.
          </DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={deleting}
              onClick={handleDelete}
            >
              Eliminar pago
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
  );
}
