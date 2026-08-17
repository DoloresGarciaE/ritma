"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { acceptInvitationAction } from "../actions";

/**
 * El botón de aceptar (S7): un verbo, estado de carga y el error visible al lado si la
 * invitación murió entre que se abrió la página y el tap (usada en otra pestaña,
 * vencida, revocada). El éxito no pasa por acá: la action redirige al dashboard.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await acceptInvitationAction(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        Aceptar invitación
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
