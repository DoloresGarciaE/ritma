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
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatListDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EnrollmentListItem } from "@/server/services/enrollments";

import { endEnrollmentAction } from "../../../cobranzas/actions";
import {
  EnrollSheet,
  type EnrollGroupOption,
  type EnrollStudentOption,
} from "../../../cobranzas/_components/enroll-sheet";

/**
 * Inscripciones de la ficha (HU4.1 + RN9): las vigentes con su plan y precio, las
 * históricas en gris con su período, el alta desde acá (sheet compartido con la agenda) y
 * la baja con confirmación §3.8 — nombra el grupo y dice la consecuencia (las cuotas ya
 * generadas persisten).
 */

const PLAN_LABEL: Record<"MONTHLY" | "DROP_IN", string> = {
  MONTHLY: "Mensual",
  DROP_IN: "Clase suelta",
};

export function EnrollmentsCard({
  student,
  enrollments,
  groups,
  today,
}: {
  student: EnrollStudentOption;
  enrollments: EnrollmentListItem[];
  /** Grupos ACTIVOS, para el selector del sheet. */
  groups: EnrollGroupOption[];
  /** Hoy en la zona de la org. */
  today: string;
}) {
  const toast = useToast();
  const [ending, startEnd] = useTransition();

  // Re-montar con key en cada apertura: nunca hay draft viejo (patrón S2).
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollKey, setEnrollKey] = useState(0);
  const [toEnd, setToEnd] = useState<EnrollmentListItem | null>(null);
  const [endDate, setEndDate] = useState(today);

  const openEnroll = () => {
    toast.closeAll();
    setEnrollKey((k) => k + 1);
    setEnrollOpen(true);
  };

  const openEnd = (enrollment: EnrollmentListItem) => {
    toast.closeAll();
    setEndDate(today);
    setToEnd(enrollment);
  };

  const handleEnd = () => {
    if (!toEnd) return;
    startEnd(async () => {
      let state;
      try {
        state = await endEnrollmentAction({
          enrollmentId: toEnd.id,
          endDate,
          studentId: student.id,
        });
      } catch {
        setToEnd(null);
        toast.error("No se pudo registrar la baja. Actualizá y probá de nuevo.");
        return;
      }

      if (state.formError) {
        setToEnd(null);
        toast.error(state.formError);
        return;
      }

      setToEnd(null);
      toast.notify(`Baja de ${toEnd.group.name} registrada.`);
    });
  };

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="font-medium text-text">Inscripciones</h3>

      {enrollments.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Todavía no está en ningún grupo. Inscribilo y las cuotas se generan solas.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {enrollments.map((enrollment) => {
            const ended = enrollment.endDate !== null;
            return (
              <li
                key={enrollment.id}
                className={cn(
                  "flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0",
                  ended && "text-text-secondary",
                )}
              >
                <div className="flex min-w-0 flex-col">
                  <span className={cn("truncate font-medium", ended ? "" : "text-text")}>
                    {enrollment.group.name}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {PLAN_LABEL[enrollment.plan]} ·{" "}
                    <span className="tabular-nums">{formatMoney(enrollment.price)}</span> ·{" "}
                    {ended
                      ? `${formatListDate(enrollment.startDate)} – ${formatListDate(enrollment.endDate!)} · De baja`
                      : `desde ${formatListDate(enrollment.startDate)}`}
                  </span>
                </div>

                {ended ? null : (
                  <Button variant="ghost" size="sm" onClick={() => openEnd(enrollment)}>
                    Dar de baja
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Button variant="secondary" size="lg" className="w-full" onClick={openEnroll}>
        Inscribir a un grupo
      </Button>

      <EnrollSheet
        key={enrollKey}
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        student={student}
        groups={groups}
        today={today}
      />

      {/* Confirmación §3.8: nombra el objeto y la consecuencia (RN9). */}
      <Dialog open={toEnd !== null} onOpenChange={(open) => (open ? null : setToEnd(null))}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>¿Dar de baja la inscripción a {toEnd?.group.name}?</DialogTitle>
          <DialogDescription>
            No se generan más cuotas desde el mes siguiente a la baja. Las ya generadas se conservan
            (podés exonerarlas desde el estado de cuenta).
          </DialogDescription>

          <Field label="Fecha de baja">
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text"
            />
          </Field>

          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={ending}
              onClick={handleEnd}
            >
              Dar de baja
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
    </Card>
  );
}
