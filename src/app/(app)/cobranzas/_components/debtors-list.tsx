"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatListDate, formatMoney } from "@/lib/format";
import type { DebtorRow } from "@/server/services/charges";

import { PaymentSheet } from "./payment-sheet";

/**
 * La lista de deudores (S4): una fila por cuota impaga con lo que FALTA (una PARTIAL
 * debe su remanente, no el total) y — el corazón del DoD de HU4.3 — "Registrar pago" EN
 * la fila: desde acá, un pago completo son tres taps. §3.5 pedía las acciones en la
 * ficha; este bloque la versiona: UNA sola acción por fila, la que define el producto.
 *
 * El tap de la fila sigue yendo a la ficha; el sheet abre con TODA la deuda del alumno
 * pre-cargada (HU4.3), no solo esta cuota.
 */
export function DebtorsList({
  debtors,
  isStudio,
  attachmentsEnabled,
  today,
}: {
  debtors: DebtorRow[];
  isStudio: boolean;
  attachmentsEnabled: boolean;
  today: string;
}) {
  const toast = useToast();
  const [paying, setPaying] = useState<{ id: string; name: string } | null>(null);
  const [payKey, setPayKey] = useState(0);

  const openPay = (student: { id: string; name: string }) => {
    toast.closeAll();
    setPayKey((key) => key + 1);
    setPaying(student);
  };

  return (
    <>
      <ul className="divide-y divide-border border-y border-border bg-surface">
        {debtors.map((debtor) => (
          <li key={debtor.chargeId} className="flex flex-col gap-2 px-4 py-3">
            <Link href={`/alumnos/${debtor.student.id}`} className="flex items-center gap-3">
              <Avatar name={debtor.student.name} size="md" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-text">{debtor.student.name}</span>
                <span className="truncate text-xs text-text-secondary">
                  {debtor.group.name} · vence {formatListDate(debtor.dueDate)}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-display text-sm font-medium text-text tabular-nums">
                  {formatMoney(debtor.remaining)}
                </span>
                {debtor.remaining < debtor.amount ? (
                  <span className="text-xs text-text-secondary tabular-nums">
                    de {formatMoney(debtor.amount)}
                  </span>
                ) : null}
                <StatusBadge status={debtor.status} />
              </div>
            </Link>

            {/* La única acción de la fila (nota S4 en §3.5): el flujo de los 15 segundos. */}
            <div className="pl-[52px]">
              <Button variant="secondary" size="sm" onClick={() => openPay(debtor.student)}>
                Registrar pago
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {paying ? (
        <PaymentSheet
          key={`${paying.id}-${payKey}`}
          open={paying !== null}
          onOpenChange={(open) => {
            if (!open) setPaying(null);
          }}
          student={paying}
          isStudio={isStudio}
          attachmentsEnabled={attachmentsEnabled}
          today={today}
        />
      ) : null}
    </>
  );
}
