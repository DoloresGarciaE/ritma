"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { shareLink } from "@/lib/share";
import { cn } from "@/lib/utils";

import { createInvitationAction } from "../../actions";

const chipStyles = (selected: boolean) =>
  cn(
    "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
    selected
      ? "border-primary bg-nav-active-bg text-nav-active-text"
      : "border-border-strong bg-surface text-text hover:bg-muted",
  );

const ROLE_HELP: Record<"TEACHER" | "ADMIN", string> = {
  TEACHER: "Dicta clases: ve y gestiona sus grupos, sus alumnos y sus cobranzas.",
  ADMIN: "Gestiona el estudio completo, como vos. No dicta clases.",
};

/**
 * Invitar al equipo (S7, HU1.3): rol + email opcional. El resultado es SIEMPRE un link
 * copiable; con email (y Resend configurado) además sale el mail. Sin Resend, el campo
 * queda deshabilitado CON el motivo (§4.3): es "temporalmente no disponible", no un
 * permiso.
 */
export function InviteTeam({ emailEnabled }: { emailEnabled: boolean }) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"TEACHER" | "ADMIN">("TEACHER");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; note: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setRole("TEACHER");
    setEmail("");
    setEmailError(null);
    setFormError(null);
    setCreated(null);
  };

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleCreate = () => {
    startTransition(async () => {
      setFormError(null);
      setEmailError(null);

      const result = await createInvitationAction({ role, email: emailEnabled ? email : "" });

      if ("error" in result) {
        if (result.field === "email") setEmailError(result.error);
        else setFormError(result.error);
        return;
      }

      router.refresh();
      setCreated({
        url: result.url,
        note: result.emailSent
          ? `Le mandamos el email a ${email.trim()}.`
          : (result.emailError ?? null),
      });
    });
  };

  const share = async () => {
    if (!created) return;
    const outcome = await shareLink(created.url, "Invitación al equipo");
    if (outcome === "copied") toast.notify("Link copiado.");
    if (outcome === "failed") toast.error("No se pudo compartir el link. Probá de nuevo.");
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Invitar
      </Button>

      <ActionSheet
        open={open}
        onOpenChange={close}
        title={created ? "Invitación lista" : "Invitar al equipo"}
        description={
          created
            ? "Compartí el link: sirve una sola vez y vence a los 7 días."
            : "El link es la llave: quien lo abra entra con el rol que elijas."
        }
      >
        {created ? (
          <>
            <ActionSheetBody className="flex flex-col gap-4 py-4">
              {created.note ? <p className="text-sm text-text-secondary">{created.note}</p> : null}

              <div className="rounded-control border border-border bg-muted px-3 py-2.5">
                <p className="text-xs break-all text-text-secondary">{created.url}</p>
              </div>
            </ActionSheetBody>
            <ActionSheetFooter className="flex flex-col gap-2">
              <Button size="lg" onClick={share}>
                Compartir link
              </Button>
              <Button variant="ghost" size="lg" onClick={() => close(false)}>
                Listo
              </Button>
            </ActionSheetFooter>
          </>
        ) : (
          <>
            <ActionSheetBody className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text">Rol</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={role === "TEACHER"}
                    onClick={() => setRole("TEACHER")}
                    className={chipStyles(role === "TEACHER")}
                  >
                    Profe
                  </button>
                  <button
                    type="button"
                    aria-pressed={role === "ADMIN"}
                    onClick={() => setRole("ADMIN")}
                    className={chipStyles(role === "ADMIN")}
                  >
                    Admin
                  </button>
                </div>
                <p className="text-xs text-text-secondary">{ROLE_HELP[role]}</p>
              </div>

              <Field
                label="Email (opcional)"
                error={emailError ?? undefined}
                helpText={
                  emailEnabled
                    ? "Con email, además del link le mandamos la invitación por mail."
                    : "El envío por email no está disponible por ahora: compartí el link."
                }
              >
                <Input
                  type="email"
                  autoComplete="off"
                  placeholder="caro@example.com"
                  value={email}
                  disabled={!emailEnabled}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailError) setEmailError(null);
                  }}
                />
              </Field>

              {formError ? (
                <p role="alert" className="text-xs text-danger">
                  {formError}
                </p>
              ) : null}
            </ActionSheetBody>
            <ActionSheetFooter>
              <Button size="lg" loading={pending} onClick={handleCreate}>
                Crear invitación
              </Button>
            </ActionSheetFooter>
          </>
        )}
      </ActionSheet>
    </>
  );
}
