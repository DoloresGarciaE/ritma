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
  const [pending, startAction] = useTransition();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [movedToDate, setMovedToDate] = useState("");
  const [movedToStartTime, setMovedToStartTime] = useState("");
  const [errors, setErrors] = useState<{ movedToDate?: string; movedToStartTime?: string }>({});

  if (!occurrence) return null;

  const cancelled = occurrence.status === "CANCELLED";
  const ref = { slotId: occurrence.slotId, date: occurrence.originalDate };

  const close = () => {
    setConfirmOpen(false);
    setRescheduleOpen(false);
    onOpenChange(false);
  };

  const openReschedule = () => {
    // Defaults: la posición actual de la sesión — mover suele ser "otro día, misma hora".
    setMovedToDate(occurrence.date);
    setMovedToStartTime(occurrence.startTime);
    setErrors({});
    setRescheduleOpen(true);
  };

  const handleCancel = () => {
    startAction(async () => {
      await cancelSessionAction(ref);
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

    startAction(async () => {
      const state = await rescheduleSessionAction(input);

      if (state.errors) {
        setErrors(state.errors);
        return;
      }

      close();
      toast.notify(`La sesión se movió al ${formatListDate(movedToDate)}`);
    });
  };

  const handleRestore = () => {
    startAction(async () => {
      await restoreSessionAction(ref);
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
      onOpenChange={onOpenChange}
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

            <div className="flex flex-wrap items-start gap-2">
              <div className="flex flex-col gap-1">
                <input
                  type="date"
                  aria-label="Nueva fecha"
                  value={movedToDate}
                  onChange={(event) => {
                    setMovedToDate(event.target.value);
                    if (errors.movedToDate)
                      setErrors((prev) => ({ ...prev, movedToDate: undefined }));
                  }}
                  className="h-11 rounded-control border border-border-strong bg-surface px-3 font-display text-base text-text tabular-nums transition-[border-color]"
                />
                {errors.movedToDate ? (
                  <p className="text-xs text-danger">{errors.movedToDate}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <input
                  type="time"
                  aria-label="Nueva hora"
                  value={movedToStartTime}
                  onChange={(event) => {
                    setMovedToStartTime(event.target.value);
                    if (errors.movedToStartTime)
                      setErrors((prev) => ({ ...prev, movedToStartTime: undefined }));
                  }}
                  className="h-11 rounded-control border border-border-strong bg-surface px-3 font-display text-base text-text tabular-nums transition-[border-color]"
                />
                {errors.movedToStartTime ? (
                  <p className="text-xs text-danger">{errors.movedToStartTime}</p>
                ) : null}
              </div>
            </div>

            <p className="text-xs text-text-secondary">
              El resto de las semanas no cambia. Para mover el horario de todas, editá el grupo.
            </p>

            <Button size="md" loading={pending} onClick={handleReschedule}>
              Mover sesión
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {cancelled ? (
            <Button variant="secondary" size="lg" loading={pending} onClick={handleRestore}>
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
                <Button variant="secondary" size="lg" loading={pending} onClick={handleRestore}>
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
              loading={pending}
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
