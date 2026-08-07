"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatListDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReminderHistoryItem } from "@/server/services/reminders";

import { logReminderAction, sendEmailReminderAction } from "../../../cobranzas/actions";

/**
 * Recordatorios en la ficha (HU5.2–5.3 + el historial que HU2.2 dejó pendiente).
 *
 * Con deuda del período: WhatsApp (link wa.me ya renderizado — abre sin esperar red;
 * el log viaja en paralelo, mejor esfuerzo) y Email (server-side vía Resend). Sin
 * deuda, las acciones no aparecen: no hay nada que recordar. Email deshabilitado con
 * motivo visible (§4.3) cuando falta la env o el alumno no tiene email.
 *
 * El historial es fecha y canal, y nada más: no inventamos estados de "entregado" o
 * "leído" que el deep link no puede conocer.
 */

const CHANNEL_LABEL: Record<ReminderHistoryItem["channel"], string> = {
  WHATSAPP_LINK: "WhatsApp",
  EMAIL: "Email",
};

export function RemindersCard({
  studentId,
  waUrl,
  hasDebt,
  emailConfigured,
  hasEmail,
  history,
}: {
  studentId: string;
  /** El link wa.me con la plantilla renderizada, o null si el alumno no tiene teléfono. */
  waUrl: string | null;
  hasDebt: boolean;
  emailConfigured: boolean;
  hasEmail: boolean;
  history: ReminderHistoryItem[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [sendingEmail, startEmail] = useTransition();

  const logWhatsapp = () => {
    // Fire-and-forget: la navegación a wa.me no espera a la red. Al volver, refrescamos
    // para que el historial muestre el disparo; si el log falló, no hay nada que avisar
    // (mejor esfuerzo por diseño).
    void logReminderAction({ studentId })
      .then(() => router.refresh())
      .catch(() => {});
  };

  const sendEmail = () => {
    startEmail(async () => {
      let result: { error?: string };
      try {
        result = await sendEmailReminderAction(studentId);
      } catch {
        toast.error("No se pudo enviar el email. Probá de nuevo.");
        return;
      }
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.notify("Recordatorio enviado por email.");
      router.refresh();
    });
  };

  const emailReason = !emailConfigured
    ? "El envío por email no está configurado."
    : !hasEmail
      ? "El alumno no tiene email cargado."
      : null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium text-text">Recordatorios</h2>

      {hasDebt ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                onClick={logWhatsapp}
              >
                Recordar por WhatsApp
              </a>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                Recordar por WhatsApp
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={Boolean(emailReason)}
              loading={sendingEmail}
              onClick={sendEmail}
            >
              Recordar por email
            </Button>
          </div>
          {/* §4.3: deshabilitado solo con motivo visible. */}
          {!waUrl ? (
            <p className="text-xs text-text-secondary">
              Sin teléfono cargado: agregalo en los datos del alumno.
            </p>
          ) : null}
          {emailReason ? <p className="text-xs text-text-secondary">{emailReason}</p> : null}
        </div>
      ) : null}

      {history.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin recordatorios todavía.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {history.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text">{CHANNEL_LABEL[item.channel]}</span>
              <span className="text-text-secondary">{formatListDate(item.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
