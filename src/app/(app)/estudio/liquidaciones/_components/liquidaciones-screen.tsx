"use client";

import { ChevronLeft, ChevronRight, Scale } from "lucide-react";
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
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { addMonths } from "@/lib/dates";
import { formatListDate, formatMoney, formatPeriod } from "@/lib/format";
import type {
  SettlementDetail,
  SettlementNumbers,
  SettlementOverview,
  SettlementTeacherRow,
} from "@/server/services/settlements";

import {
  closeSettlementAction,
  markSettlementPaidAction,
  settlementDetailAction,
} from "../actions";

/**
 * Liquidaciones (S9, §3.12): cards por profe en mobile — bruto, retención, cobrado en
 * mano y NETO con signo explícito (§4.2: jamás solo color) — con drill-down a los pagos
 * (F3 paso 2), cierre con confirmación que resume, y marca de pagada. Los baldes de la
 * decisión 4 SE CANTAN: grupos sin profe y cobros en mano sin atribuir. La voz es la de
 * Marca §4: los números se presentan, no se dramatizan.
 */

const STATE_LABEL: Record<SettlementTeacherRow["state"], string> = {
  draft: "Borrador",
  "needs-agreement": "Sin acuerdo",
  closed: "Cerrada",
  paid: "Pagada",
};

/** §4.2: los negativos con signo explícito, nunca solo color. */
function signedMoney(value: number): string {
  return value < 0 ? `−${formatMoney(Math.abs(value))}` : formatMoney(value);
}

function NumbersGrid({ numbers }: { numbers: SettlementNumbers }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {(
        [
          ["Bruto cobrado", formatMoney(numbers.gross)],
          ["Retención del estudio", formatMoney(numbers.studioShare)],
          ["Cobrado en mano", formatMoney(numbers.collectedByTeacher)],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-2">
          <dt className="text-text-secondary">{label}</dt>
          <dd className="font-display tabular-nums text-text">{value}</dd>
        </div>
      ))}
      <div className="col-span-2 mt-1 flex items-baseline justify-between gap-2 border-t border-border pt-2">
        <dt className="font-medium text-text">
          {numbers.netToTeacher < 0 ? "Neto — a favor del estudio" : "Neto — a favor del profe"}
        </dt>
        <dd className="font-display text-base font-medium tabular-nums text-text">
          {signedMoney(numbers.netToTeacher)}
        </dd>
      </div>
    </dl>
  );
}

function TeacherCard({ row, onOpen }: { row: SettlementTeacherRow; onOpen: () => void }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <button
        type="button"
        onClick={onOpen}
        className="flex cursor-pointer flex-col gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-text">{row.displayName}</span>
          {!row.linked ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
              Desvinculada
            </span>
          ) : null}
          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
            {STATE_LABEL[row.state]}
          </span>
        </div>

        {row.numbers ? (
          <NumbersGrid numbers={row.numbers} />
        ) : (
          <p className="text-sm text-text-secondary">
            Sin acuerdo vigente: definilo en el equipo para calcular su liquidación.
          </p>
        )}
      </button>
    </Card>
  );
}

export function LiquidacionesAdmin({
  overview,
  currentPeriod,
}: {
  overview: SettlementOverview;
  currentPeriod: string;
}) {
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const { period } = overview;
  const closable = period < currentPeriod;

  const href = (target: string) =>
    `/estudio/liquidaciones${target === addMonths(currentPeriod, -1) ? "" : `?periodo=${target}`}`;

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

      {period === currentPeriod ? (
        <p className="px-1 text-xs text-text-secondary">
          El mes en curso es un borrador vivo: se recalcula con cada pago y se cierra cuando
          termine.
        </p>
      ) : null}

      {overview.teachers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <Scale aria-hidden className="size-12 text-text-muted" />
          <h2 className="font-display text-lg font-medium text-text">Nadie que liquidar todavía</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Cuando el equipo tenga profes staff con acuerdo, el cierre de mes sale de acá.
          </p>
        </div>
      ) : (
        overview.teachers.map((row) => (
          <TeacherCard key={row.teacherId} row={row} onOpen={() => setDetailFor(row.teacherId)} />
        ))
      )}

      {/* Decisión 4: los huecos se cantan, no se tragan. */}
      {overview.unassigned.count > 0 ? (
        <div className="rounded-card bg-warning-bg px-3 py-2.5 text-sm text-warning-text">
          {formatMoney(overview.unassigned.total)} del período en{" "}
          {overview.unassigned.count === 1
            ? "1 cuota de un grupo sin profe"
            : `${overview.unassigned.count} cuotas de grupos sin profe`}
          : no entran a ninguna liquidación.{" "}
          <Link href="/agenda" className="font-medium underline">
            Asignar profes
          </Link>
        </div>
      ) : null}
      {overview.unattributed.count > 0 ? (
        <div className="rounded-card bg-warning-bg px-3 py-2.5 text-sm text-warning-text">
          {formatMoney(overview.unattributed.total)} cobrados en mano sin decir qué profe (
          {overview.unattributed.count === 1 ? "1 pago" : `${overview.unattributed.count} pagos`}
          ): no entran a ningún C.
        </div>
      ) : null}

      <SettlementDetailSheet
        teacherId={detailFor}
        period={period}
        onClose={() => setDetailFor(null)}
        manage
        closable={closable}
      />
    </div>
  );
}

export function LiquidacionesMine({
  current,
  history,
  period,
}: {
  current: SettlementTeacherRow | null;
  history: SettlementTeacherRow[];
  period: string;
}) {
  const [detail, setDetail] = useState<{ teacherId: string; period: string } | null>(null);

  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      {current ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-medium text-text-secondary">
            {formatPeriod(period)} · en curso
          </h2>
          <TeacherCard
            row={current}
            onOpen={() => setDetail({ teacherId: current.teacherId, period })}
          />
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-medium text-text-secondary">Cerradas</h2>
          {history.map((row) => (
            <Card key={row.settlementId} className="flex flex-col gap-3 p-4">
              <button
                type="button"
                onClick={() => setDetail({ teacherId: row.teacherId, period: row.period })}
                className="flex cursor-pointer flex-col gap-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text">{formatPeriod(row.period)}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {STATE_LABEL[row.state]}
                  </span>
                </div>
                {row.numbers ? <NumbersGrid numbers={row.numbers} /> : null}
              </button>
            </Card>
          ))}
        </section>
      ) : (
        <p className="px-1 text-sm text-text-secondary">
          Cuando el estudio cierre un mes, tu liquidación queda acá con su detalle.
        </p>
      )}

      <SettlementDetailSheet
        teacherId={detail?.teacherId ?? null}
        period={detail?.period ?? period}
        onClose={() => setDetail(null)}
        manage={false}
        closable={false}
      />
    </div>
  );
}

function SettlementDetailSheet({
  teacherId,
  period,
  onClose,
  manage,
  closable,
}: {
  teacherId: string | null;
  period: string;
  onClose: () => void;
  manage: boolean;
  closable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [fetched, setFetched] = useState<SettlementDetail | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [working, startWork] = useTransition();

  useEffect(() => {
    if (!teacherId) return;
    let alive = true;
    settlementDetailAction(teacherId, period)
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

  // Se muestra SOLO lo pedido: al reabrir con otro profe u otro período, el detalle
  // anterior no vale (skeleton hasta que llegue el nuevo) — sin setState en el efecto.
  const detail =
    fetched && fetched.teacher.id === teacherId && fetched.period === period ? fetched : null;

  const handleClose = () => {
    if (!detail) return;
    startWork(async () => {
      const result = await closeSettlementAction(detail.teacher.id, detail.period);
      setConfirmClose(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.notify(
        `Liquidación de ${formatPeriod(detail.period)} cerrada: ${signedMoney(
          result.numbers?.netToTeacher ?? 0,
        )} ${result.numbers && result.numbers.netToTeacher < 0 ? "a favor del estudio" : `a favor de ${detail.teacher.displayName}`}.`,
      );
      onClose();
      router.refresh();
    });
  };

  return (
    <ActionSheet
      open={teacherId !== null}
      onOpenChange={(next) => !next && onClose()}
      title={detail ? detail.teacher.displayName : "Liquidación"}
      description={
        detail ? `${formatPeriod(detail.period)} · ${STATE_LABEL[detail.state]}` : "Cargando…"
      }
    >
      <ActionSheetBody className="flex flex-col gap-4 py-4">
        {!detail ? (
          <div className="h-24 animate-skeleton rounded-card bg-muted" />
        ) : (
          <>
            <NumbersGrid numbers={detail.numbers} />

            {detail.tranches.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text">
                  Tramos de vigencia (el acuerdo cambió)
                </span>
                <ul className="flex flex-col gap-1">
                  {detail.tranches.map((tranche) => (
                    <li
                      key={tranche.validFrom}
                      className="flex items-baseline justify-between rounded-card bg-muted px-3 py-2 text-sm"
                    >
                      <span className="text-text-secondary">
                        {tranche.studioPercent}% desde el {formatListDate(tranche.validFrom)}
                      </span>
                      <span className="font-display tabular-nums text-text">
                        {formatMoney(tranche.gross)} → {formatMoney(tranche.share)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">
                {detail.payments.length === 1
                  ? "1 pago en el período"
                  : `${detail.payments.length} pagos en el período`}
              </span>
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                {detail.payments.map((payment, index) => (
                  <li
                    key={`${payment.paymentId}-${index}`}
                    className="flex flex-col gap-0.5 px-3 py-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-text">{payment.studentName}</span>
                      <span className="shrink-0 font-display text-sm tabular-nums text-text">
                        {formatMoney(payment.allocatedToTeacher)}
                      </span>
                    </div>
                    <span className="text-xs text-text-secondary">
                      {formatListDate(payment.paidAt)}
                      {payment.collectedByTeacher
                        ? ` · en mano (${formatMoney(payment.amount)})`
                        : ""}
                      {payment.late ? " · imputación de un mes ya cerrado" : ""}
                    </span>
                  </li>
                ))}
                {detail.payments.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-text-secondary">
                    Sin pagos en el período: todo en cero.
                  </li>
                ) : null}
              </ul>
            </div>

            {detail.unallocatedRemainder > 0 && detail.state === "draft" ? (
              <p className="text-xs text-text-secondary">
                {formatMoney(detail.unallocatedRemainder)} de estos pagos quedaron como saldo a
                favor: se liquidan cuando se imputen, en el mes que corresponda.
              </p>
            ) : null}
          </>
        )}
      </ActionSheetBody>

      {detail && manage && detail.state === "draft" && closable ? (
        <ActionSheetFooter>
          <Button size="lg" onClick={() => setConfirmClose(true)}>
            Cerrar liquidación
          </Button>
        </ActionSheetFooter>
      ) : null}
      {detail && manage && detail.state === "closed" ? (
        <ActionSheetFooter>
          <MarkPaidButton detail={detail} onDone={onClose} />
        </ActionSheetFooter>
      ) : null}

      {/* §3.8: la confirmación resume lo que congela. */}
      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>
            ¿Cerrar {formatPeriod(detail?.period ?? "")} de {detail?.teacher.displayName}?
          </DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.payments.filter((p) => !p.late).length} pagos quedan congelados (no se podrán eliminar) y el neto queda fijado en ${signedMoney(detail.numbers.netToTeacher)}. No hay reapertura.`
              : ""}
          </DialogDescription>
          <div className="flex flex-col gap-2">
            <Button size="lg" className="w-full" loading={working} onClick={handleClose}>
              Cerrar liquidación
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

function MarkPaidButton({ detail, onDone }: { detail: SettlementDetail; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [working, startWork] = useTransition();

  return (
    <Button
      size="lg"
      variant="secondary"
      loading={working}
      onClick={() =>
        startWork(async () => {
          const result = await markSettlementPaidAction(detail.settlementId ?? "");
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.notify(`Liquidación de ${formatPeriod(detail.period)} marcada como pagada.`);
          onDone();
          router.refresh();
        })
      }
    >
      Marcar pagada
    </Button>
  );
}
