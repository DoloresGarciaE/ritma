"use client";

import { ChevronLeft, ChevronRight, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AmountInput, Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { addMonths } from "@/lib/dates";
import { formatListDate, formatMoney, formatPeriod, formatTimeRange } from "@/lib/format";
import type { RentalDetail, RentalsOverview } from "@/server/services/rentals";

import {
  markRentalPaidAction,
  rentalDetailAction,
  updateRentalAmountAction,
  waiveRentalAction,
} from "../actions";

/**
 * Alquileres (S10, HU6.3): cada externo con su cargo del período — badge §3.3 (los
 * mismos estados que una cuota, RN3), detalle del cálculo (tarifa, sesiones contadas,
 * la señal de grupos sin salón), editar monto en PENDING, marcar pagado con fecha y
 * método, y exonerar con confirmación. Sin imputaciones ni parciales: acá se paga
 * completo (decisión S10). La voz es la de Marca §4.
 */

const RENTAL_MODE_LABEL = {
  MONTHLY: "fijo por mes",
  PER_SESSION: "por sesión",
  PER_HOUR: "por hora",
} as const;

const METHOD_LABEL = { CASH: "Efectivo", TRANSFER: "Transferencia", OTHER: "Otro" } as const;

export function AlquileresScreen({
  overview,
  currentPeriod,
  today,
}: {
  overview: RentalsOverview;
  currentPeriod: string;
  today: string;
}) {
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const { period } = overview;

  const href = (target: string) =>
    `/estudio/alquileres${target === addMonths(currentPeriod, -1) ? "" : `?periodo=${target}`}`;

  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      <nav aria-label="Cambiar de período" className="flex items-center gap-2">
        <Link
          href={href(addMonths(period, -1))}
          aria-label="Período anterior"
          className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <span className="min-w-0 flex-1 truncate text-center font-display text-sm font-medium text-text">
          {formatPeriod(period)}
          {period === currentPeriod ? " · en curso" : ""}
        </span>
        <Link
          href={href(addMonths(period, 1))}
          aria-label="Período siguiente"
          className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
        >
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      </nav>

      {overview.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <KeyRound aria-hidden className="size-12 text-text-muted" />
          <h2 className="font-display text-lg font-medium text-text">Nadie alquila todavía</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Cuando el equipo tenga profes externos con acuerdo, sus cargos de cada mes salen de acá.
          </p>
        </div>
      ) : (
        overview.rows.map((row) => (
          <Card key={row.teacherId} className="flex flex-col gap-3 p-4">
            <button
              type="button"
              onClick={() => setDetailFor(row.teacherId)}
              className="flex cursor-pointer flex-col gap-2 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-text">{row.displayName}</span>
                <span className="ml-auto shrink-0">
                  {row.charge ? (
                    <StatusBadge status={row.charge.status} />
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {row.reason === "no-agreement" ? "Sin acuerdo" : "Sin cargo"}
                    </span>
                  )}
                </span>
              </div>

              {row.charge ? (
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-text-secondary">
                    {row.charge.sessionsCount > 0
                      ? `${row.charge.sessionsCount} ${row.charge.sessionsCount === 1 ? "sesión dictada" : "sesiones dictadas"}`
                      : "Cargo fijo del mes"}
                    {row.charge.status === "PAID" && row.charge.paidAt
                      ? ` · pagado el ${formatListDate(row.charge.paidAt)}`
                      : ` · vence el ${formatListDate(row.charge.dueDate)}`}
                  </span>
                  <span className="font-display font-medium text-text tabular-nums">
                    {formatMoney(row.charge.amount)}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">
                  {row.reason === "no-agreement"
                    ? "Definí su acuerdo en el equipo para que el alquiler se genere solo."
                    : "Este período no generó cargo (sin sesiones dictadas, o el mes todavía no cerró)."}
                </p>
              )}
            </button>
          </Card>
        ))
      )}

      <RentalDetailSheet
        teacherId={detailFor}
        period={period}
        onClose={() => setDetailFor(null)}
        today={today}
      />
    </div>
  );
}

function RentalDetailSheet({
  teacherId,
  period,
  onClose,
  today,
}: {
  teacherId: string | null;
  period: string;
  onClose: () => void;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [fetched, setFetched] = useState<RentalDetail | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [editingAmount, setEditingAmount] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paidAt, setPaidAt] = useState(today);
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "OTHER">("TRANSFER");
  const [confirmWaive, setConfirmWaive] = useState(false);
  const [working, startWork] = useTransition();

  useEffect(() => {
    if (!teacherId) return;
    let alive = true;
    rentalDetailAction(teacherId, period)
      .then((result) => {
        if (!alive) return;
        if ("error" in result) {
          toast.error(result.error);
          onClose();
        } else {
          setFetched(result);
        }
      })
      .catch(() => {
        toast.error("No se pudo cargar el detalle. Probá de nuevo.");
        onClose();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, period]);

  // Se muestra SOLO lo pedido (lección S9): al reabrir con otro externo, skeleton.
  const detail =
    fetched && fetched.teacher.id === teacherId && fetched.period === period ? fetched : null;
  const charge = detail?.charge ?? null;

  const refresh = () => {
    setFetched(null);
    setEditingAmount(false);
    setPaying(false);
    onClose();
    router.refresh();
  };

  const chip = (selected: boolean) =>
    `flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border px-3 text-sm transition-colors ${
      selected
        ? "border-primary bg-primary/10 font-medium text-primary"
        : "border-border bg-surface text-text hover:bg-muted"
    }`;

  return (
    <ActionSheet
      open={teacherId !== null}
      onOpenChange={(next) => !next && onClose()}
      title={detail ? detail.teacher.displayName : "Alquiler"}
      description={
        detail
          ? `${formatPeriod(detail.period)}${detail.rentalPeriod ? ` · ${RENTAL_MODE_LABEL[detail.rentalPeriod]}` : ""}`
          : "Cargando…"
      }
    >
      <ActionSheetBody className="flex flex-col gap-4 py-4">
        {!detail ? (
          <div className="h-24 animate-skeleton rounded-card bg-muted" />
        ) : (
          <>
            {charge ? (
              <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-medium text-text tabular-nums">
                    {formatMoney(charge.amount)}
                  </span>
                  <StatusBadge status={charge.status} />
                </div>
                <p className="text-sm text-text-secondary">
                  {charge.status === "PAID" && charge.paidAt
                    ? `Pagado el ${formatListDate(charge.paidAt)}${charge.method ? ` · ${METHOD_LABEL[charge.method]}` : ""}`
                    : charge.status === "WAIVED"
                      ? "Exonerado: no se cobra."
                      : `Vence el ${formatListDate(charge.dueDate)}`}
                </p>
                {/* El cálculo que lo generó (los HECHOS congelados al generar). */}
                {detail.rate !== null && charge.sessionsCount > 0 ? (
                  <p className="text-sm text-text-secondary">
                    {detail.rentalPeriod === "PER_HOUR"
                      ? `${charge.minutesTotal} min a ${formatMoney(detail.rate)} la hora`
                      : `${charge.sessionsCount} ${charge.sessionsCount === 1 ? "sesión" : "sesiones"} a ${formatMoney(detail.rate)} cada una`}
                  </p>
                ) : null}
                {charge.unspacedSessions > 0 ? (
                  <p className="rounded-card bg-warning-bg px-3 py-2 text-xs text-warning-text">
                    {charge.unspacedSessions === 1
                      ? "1 de esas sesiones es de un grupo sin salón: contó igual."
                      : `${charge.unspacedSessions} de esas sesiones son de grupos sin salón: contaron igual.`}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="rounded-card bg-muted px-3 py-2 text-sm text-text-secondary">
                {detail.rate === null
                  ? "Sin acuerdo de alquiler: definilo en el equipo y el cargo se genera solo."
                  : "Este período no tiene cargo generado."}
              </p>
            )}

            {/* Las sesiones del período, en vivo: el contexto del cálculo. */}
            {detail.sessions.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text">
                  {detail.sessions.length === 1
                    ? "1 sesión en el período"
                    : `${detail.sessions.length} sesiones en el período`}
                </span>
                <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                  {detail.sessions.map((session, index) => (
                    <li
                      key={`${session.date}-${session.startTime}-${index}`}
                      className="flex items-baseline justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span
                        className={session.cancelled ? "text-text-muted line-through" : "text-text"}
                      >
                        {formatListDate(session.date)} ·{" "}
                        {formatTimeRange(session.startTime, session.durationMin)}
                      </span>
                      <span className="shrink-0 text-xs text-text-secondary">
                        {session.cancelled
                          ? "cancelada · no cuenta"
                          : (session.spaceName ?? "sin salón")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Editar el monto: solo PENDING (decisión S10, espíritu RN2). */}
            {charge && charge.status === "PENDING" && editingAmount ? (
              <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
                <Field label="Nuevo monto">
                  <AmountInput value={amount} onValueChange={setAmount} />
                </Field>
                <Button
                  size="md"
                  loading={working}
                  onClick={() =>
                    startWork(async () => {
                      const result = await updateRentalAmountAction(charge.id, amount);
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.notify("Monto actualizado.");
                      refresh();
                    })
                  }
                >
                  Guardar monto
                </Button>
              </div>
            ) : null}

            {/* Marcar pagado (HU6.3): completo, con fecha y método. */}
            {charge && (charge.status === "PENDING" || charge.status === "OVERDUE") && paying ? (
              <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
                <Field label="Fecha de pago">
                  <Input
                    type="date"
                    value={paidAt}
                    className="font-display tabular-nums"
                    onChange={(event) => setPaidAt(event.target.value)}
                  />
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-text">Método</span>
                  <div role="group" aria-label="Método" className="flex flex-wrap gap-2">
                    {(["TRANSFER", "CASH", "OTHER"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={method === value}
                        onClick={() => setMethod(value)}
                        className={chip(method === value)}
                      >
                        {METHOD_LABEL[value]}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  size="md"
                  loading={working}
                  onClick={() =>
                    startWork(async () => {
                      const result = await markRentalPaidAction(charge.id, { paidAt, method });
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.notify("Alquiler cobrado", {
                        description: `${formatMoney(charge.amount)} de ${detail.teacher.displayName} (${formatPeriod(detail.period)}).`,
                      });
                      refresh();
                    })
                  }
                >
                  Confirmar pago
                </Button>
              </div>
            ) : null}
          </>
        )}
      </ActionSheetBody>

      {charge && (charge.status === "PENDING" || charge.status === "OVERDUE") ? (
        <ActionSheetFooter className="flex flex-col gap-2">
          {!paying ? (
            <Button
              size="lg"
              onClick={() => {
                setPaying(true);
                setEditingAmount(false);
              }}
            >
              Marcar pagado
            </Button>
          ) : null}
          <div className="flex gap-2">
            {charge.status === "PENDING" && !editingAmount ? (
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => {
                  setEditingAmount(true);
                  setPaying(false);
                  setAmount(charge.amount);
                }}
              >
                Editar monto
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="md"
              className="flex-1"
              onClick={() => setConfirmWaive(true)}
            >
              Exonerar
            </Button>
          </div>
        </ActionSheetFooter>
      ) : null}

      {/* §3.8: la confirmación nombra el objeto y la consecuencia. */}
      <Dialog open={confirmWaive} onOpenChange={setConfirmWaive}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>
            ¿Exonerar el alquiler de {detail?.teacher.displayName} de{" "}
            {formatPeriod(detail?.period ?? "")}?
          </DialogTitle>
          <DialogDescription>
            {charge
              ? `El cargo de ${formatMoney(charge.amount)} queda exonerado: no se cobra y no vuelve a generarse.`
              : ""}
          </DialogDescription>
          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={working}
              onClick={() =>
                startWork(async () => {
                  if (!charge) return;
                  const result = await waiveRentalAction(charge.id);
                  setConfirmWaive(false);
                  if (result.error) {
                    toast.error(result.error);
                    return;
                  }
                  toast.notify("Cargo exonerado.");
                  refresh();
                })
              }
            >
              Exonerar
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
