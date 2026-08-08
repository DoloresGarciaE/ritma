"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatListDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DebtorRow } from "@/server/services/charges";

import { logReminderAction } from "../actions";
import { PaymentSheet } from "./payment-sheet";

/**
 * La lista de deudores (S4): una fila por cuota impaga con lo que FALTA (una PARTIAL
 * debe su remanente, no el total) y — el corazón del DoD de HU4.3 — "Registrar pago" EN
 * la fila: desde acá, un pago completo son tres taps.
 *
 * Desde S5 la fila tiene DOS acciones (nota S5 en §3.5): registrar el pago y el
 * WhatsApp del recordatorio (HU5.2) — un <a> a wa.me con el mensaje ya renderizado en
 * el server, que se abre SIN esperar red (un popup blocker mataría un window.open
 * post-await); el log viaja en paralelo, mejor esfuerzo por diseño (F2 paso 3). Sin
 * teléfono: deshabilitado con motivo y acceso directo a cargarlo (§4.3).
 *
 * El tap de la fila sigue yendo a la ficha; el sheet abre con TODA la deuda del alumno
 * pre-cargada (HU4.3), no solo esta cuota.
 */
export function DebtorsList({
  debtors,
  reminders,
  isStudio,
  attachmentsEnabled,
  today,
}: {
  debtors: DebtorRow[];
  /** Por alumno: el link wa.me con la plantilla renderizada, o null si no hay teléfono. */
  reminders: Record<string, string | null>;
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

            {/* Las dos acciones de la fila (nota S5 en §3.5): pago y recordatorio. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[52px]">
              <Button variant="secondary" size="sm" onClick={() => openPay(debtor.student)}>
                Registrar pago
              </Button>
              {reminders[debtor.student.id] ? (
                <a
                  href={reminders[debtor.student.id]!}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Recordar a ${debtor.student.name} por WhatsApp`}
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                  onClick={() =>
                    void logReminderAction({ studentId: debtor.student.id }).catch(() => {})
                  }
                >
                  WhatsApp
                </a>
              ) : (
                <>
                  <Button variant="secondary" size="sm" disabled>
                    WhatsApp
                  </Button>
                  {/* Área táctil de 44 px aunque el dibujo sea menor (§2.3), como el Button. */}
                  <Link
                    href={`/alumnos/${debtor.student.id}`}
                    className="relative text-xs font-medium text-primary after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 after:content-['']"
                  >
                    Sin teléfono · Cargarlo
                  </Link>
                </>
              )}
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
