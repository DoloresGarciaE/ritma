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
import { Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatFullDayDate, formatListDate, formatMoney, formatTimeRange } from "@/lib/format";
import type { AgendaOccurrence } from "@/server/services/sessions";

import { cancelSessionAction, rescheduleSessionAction, restoreSessionAction } from "../actions";
import { rescheduleSchema, toRescheduleFieldErrors } from "../schema";

/**
 * Detalle de sesión (HU3.2 + HU3.3): datos del grupo y las acciones sobre ESA fecha.
 *
 * La identidad de la ocurrencia es `(slotId, originalDate)` — también cuando está
 * reprogramada: por eso toda action recibe la fecha ORIGINAL, no la mostrada.
 *
 * Cancelar pide confirmación con Dialog (§3.8, el copy canónico de la spec); restablecer
 * y reprogramar no destruyen nada, así que van directo (§4.4: decisión → dialog).
 */
export function SessionDetailSheet({
  open,
  onOpenChange,
  occurrence,
  onEditGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: AgendaOccurrence | null;
  onEditGroup: (groupId: string) => void;
}) {
  const toast = useToast();
  // Transiciones separadas: que "Mover sesión" no dibuje spinners en los otros botones.
  const [cancelling, startCancel] = useTransition();
  const [moving, startMove] = useTransition();
  const [restoring, startRestore] = useTransition();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [movedToDate, setMovedToDate] = useState("");
  const [movedToStartTime, setMovedToStartTime] = useState("");
  const [errors, setErrors] = useState<{ movedToDate?: string; movedToStartTime?: string }>({});

  if (!occurrence) return null;

  const cancelled = occurrence.status === "CANCELLED";
  const ref = { slotId: occurrence.slotId, date: occurrence.originalDate };

  const resetPanels = () => {
    setConfirmOpen(false);
    setRescheduleOpen(false);
    setErrors({});
  };

  const close = () => {
    resetPanels();
    onOpenChange(false);
  };

  // Cerrar por gesto/backdrop también resetea: reabrir la MISMA ocurrencia no puede
  // encontrarse el panel de reprogramar pegado de la vez anterior.
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetPanels();
    onOpenChange(nextOpen);
  };

  // La agenda es colaborativa con uno mismo (dos pestañas, el teléfono y la compu): una
  // action puede rechazar porque la franja ya no existe o la excepción ya fue borrada.
  // Eso NO puede tirar la app entera: se avisa y la vista se refresca sola al reintentar.
  const actionFailedToast = () =>
    toast.error("No se pudo guardar. La agenda puede haber cambiado: actualizá y probá de nuevo.");

  const openReschedule = () => {
    // Defaults: la posición actual de la sesión — mover suele ser "otro día, misma hora".
    setMovedToDate(occurrence.date);
    setMovedToStartTime(occurrence.startTime);
    setErrors({});
    setRescheduleOpen(true);
  };

  const handleCancel = () => {
    startCancel(async () => {
      try {
        await cancelSessionAction(ref);
      } catch {
        close();
        actionFailedToast();
        return;
      }
      close();
      toast.notify(`Cancelaste la sesión del ${formatListDate(occurrence.date)}`);
    });
  };

  const handleReschedule = () => {
    const input = { ...ref, movedToDate, movedToStartTime };
    const parsed = rescheduleSchema.safeParse(input);

    if (!parsed.success) {
      setErrors(toRescheduleFieldErrors(parsed.error) ?? {});
      return;
    }

    startMove(async () => {
      let state;
      try {
        state = await rescheduleSessionAction(input);
      } catch {
        close();
        actionFailedToast();
        return;
      }

      if (state.errors) {
        setErrors(state.errors);
        return;
      }

      close();
      toast.notify(`La sesión se movió al ${formatListDate(movedToDate)}`);
    });
  };

  const handleRestore = () => {
    startRestore(async () => {
      try {
        await restoreSessionAction(ref);
      } catch {
        close();
        actionFailedToast();
        return;
      }
      close();
      toast.notify(
        occurrence.moved
          ? `La sesión vuelve a su horario del ${formatListDate(occurrence.originalDate)}`
          : `La sesión del ${formatListDate(occurrence.date)} vuelve a tu agenda`,
      );
    });
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={occurrence.groupName}
      description={`${formatFullDayDate(occurrence.date)} · ${formatTimeRange(occurrence.startTime, occurrence.durationMin)} · ${occurrence.disciplineName}`}
    >
      <ActionSheetBody className="flex flex-col gap-4 pb-4">
        {cancelled ? (
          <p className="rounded-card bg-muted px-3 py-2 text-sm font-medium text-text-secondary">
            Cancelada{occurrence.note ? ` · ${occurrence.note}` : ""}
          </p>
        ) : occurrence.moved ? (
          <p className="rounded-card bg-muted px-3 py-2 text-sm text-text-secondary">
            Reprogramada: era el {formatFullDayDate(occurrence.originalDate)} a las{" "}
            {occurrence.originalStartTime}.
          </p>
        ) : occurrence.note ? (
          <p className="rounded-card bg-muted px-3 py-2 text-sm text-text-secondary">
            {occurrence.note}
          </p>
        ) : null}

        <div className="flex items-baseline justify-between rounded-card border border-border bg-surface p-3">
          <span className="text-sm text-text-secondary">Tarifa de referencia</span>
          <span className="font-display text-sm font-medium text-text tabular-nums">
            {formatMoney(occurrence.defaultPrice)}
          </span>
        </div>

        {/* Los inscriptos del grupo van acá cuando exista Enrollment (S3, HU3.2). */}

        {rescheduleOpen && !cancelled ? (
          <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
            <span className="text-sm font-medium text-text">Mover solo esta sesión</span>

            <div className="grid grid-cols-2 items-start gap-2">
              <Field label="Nueva fecha" error={errors.movedToDate}>
                <Input
                  type="date"
                  value={movedToDate}
                  className="font-display tabular-nums"
                  onChange={(event) => {
                    setMovedToDate(event.target.value);
                    if (errors.movedToDate)
                      setErrors((prev) => ({ ...prev, movedToDate: undefined }));
                  }}
                />
              </Field>

              <Field label="Nueva hora" error={errors.movedToStartTime}>
                <Input
                  type="time"
                  value={movedToStartTime}
                  className="font-display tabular-nums"
                  onChange={(event) => {
                    setMovedToStartTime(event.target.value);
                    if (errors.movedToStartTime)
                      setErrors((prev) => ({ ...prev, movedToStartTime: undefined }));
                  }}
                />
              </Field>
            </div>

            <p className="text-xs text-text-secondary">
              El resto de las semanas no cambia. Para mover el horario de todas, editá el grupo.
            </p>

            <Button size="md" loading={moving} onClick={handleReschedule}>
              Mover sesión
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {cancelled ? (
            <Button variant="secondary" size="lg" loading={restoring} onClick={handleRestore}>
              Restablecer sesión
            </Button>
          ) : (
            <>
              {!rescheduleOpen ? (
                <Button variant="secondary" size="lg" onClick={openReschedule}>
                  Reprogramar
                </Button>
              ) : null}

              {occurrence.moved ? (
                <Button variant="secondary" size="lg" loading={restoring} onClick={handleRestore}>
                  Volver al horario original
                </Button>
              ) : null}

              <Button variant="destructive" size="lg" onClick={() => setConfirmOpen(true)}>
                Cancelar sesión
              </Button>
            </>
          )}

          <Button variant="ghost" size="lg" onClick={() => onEditGroup(occurrence.groupId)}>
            Editar grupo
          </Button>
        </div>
      </ActionSheetBody>

      {/* Confirmación destructiva (§3.8): nombra el objeto y la consecuencia. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>¿Cancelar la sesión del {formatFullDayDate(occurrence.date)}?</DialogTitle>
          <DialogDescription>Los alumnos no reciben aviso automático.</DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={cancelling}
              onClick={handleCancel}
            >
              Cancelar sesión
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
