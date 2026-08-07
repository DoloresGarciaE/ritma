"use client";

import { useEffect, useState, useTransition } from "react";

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

import { shareLink } from "@/lib/share";

import {
  attachmentViewUrlAction,
  deletePaymentAction,
  receiptLinkAction,
  revokeReceiptLinkAction,
} from "../actions";

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
  const [sharing, setSharing] = useState(false);
  // La URL viaja atada al id del pago: si el sheet se reabre con otro pago, la vieja
  // simplemente no matchea — sin setState de limpieza dentro del effect.
  const [prefetched, setPrefetched] = useState<{ id: string; url: string } | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, startRevoke] = useTransition();

  // El link se pide al ABRIR el sheet, no al tocar Compartir: navigator.share tiene que
  // correr en el mismo tap (un await previo se come la activación del gesto en iOS).
  const paymentId = payment?.id ?? null;
  useEffect(() => {
    if (!open || !paymentId) return;
    let stale = false;
    receiptLinkAction(paymentId)
      .then((result) => {
        if (!stale && "url" in result) setPrefetched({ id: paymentId, url: result.url });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [open, paymentId]);

  const shareUrl = prefetched?.id === paymentId ? prefetched.url : null;

  if (!payment) return null;

  const close = () => {
    setConfirmOpen(false);
    setRevokeOpen(false);
    setAttachmentUrl(null);
    onOpenChange(false);
  };

  const share = async (url: string) => {
    const outcome = await shareLink(url, "Comprobante de pago");
    if (outcome === "copied") toast.notify("Link copiado.");
    if (outcome === "failed") toast.error("No se pudo compartir el link. Probá de nuevo.");
  };

  const shareReceipt = async () => {
    // Camino normal: la URL ya está precargada y share corre en el tap. El fallback
    // (prefetch todavía en vuelo) paga el round-trip y puede caer al portapapeles.
    if (shareUrl) {
      await share(shareUrl);
      return;
    }
    setSharing(true);
    try {
      const result = await receiptLinkAction(payment.id);
      if ("error" in result) toast.error(result.error);
      else await share(result.url);
    } catch {
      toast.error("No se pudo compartir el link. Probá de nuevo.");
    } finally {
      setSharing(false);
    }
  };

  const handleRevoke = () => {
    startRevoke(async () => {
      let result: Awaited<ReturnType<typeof revokeReceiptLinkAction>>;
      try {
        result = await revokeReceiptLinkAction(payment.id);
      } catch {
        setRevokeOpen(false);
        toast.error("No se pudo revocar el link. Actualizá y probá de nuevo.");
        return;
      }
      setRevokeOpen(false);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const freshUrl = result.url;
      setPrefetched({ id: payment.id, url: freshUrl });
      // Marca §4.1: el nombre de la acción se mantiene en todo el flujo.
      toast.notify("Link revocado. El nuevo quedó listo.", {
        actionProps: { children: "Compartir comprobante", onClick: () => void share(freshUrl) },
      });
    });
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

        {/* HU5.1: compartir es la acción estrella; revocar mata el link compartido. */}
        <Button variant="secondary" size="lg" loading={sharing} onClick={shareReceipt}>
          Compartir comprobante
        </Button>
        <Button variant="ghost" size="lg" onClick={() => setRevokeOpen(true)}>
          Revocar link del comprobante
        </Button>

        <Button variant="destructive" size="lg" onClick={() => setConfirmOpen(true)}>
          Eliminar pago
        </Button>
      </ActionSheetBody>

      {/* Confirmación §3.8: nombra el objeto y la consecuencia. */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>¿Revocar el link del comprobante?</DialogTitle>
          <DialogDescription>
            El link que compartiste deja de funcionar. Se genera uno nuevo, listo para volver a
            compartir.
          </DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={revoking}
              onClick={handleRevoke}
            >
              Revocar link
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
