"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { ToastProvider, useToast } from "@/components/ui/toast";

/**
 * Sheet y Toast son OVERLAYS: no se pueden mostrar en los dos modos a la vez como el resto de
 * /dev/ui. Van acá, interactivos, siguiendo el modo del sistema.
 */

function Demo() {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Abrir sheet (mobile: gesto · desktop: dialog)
      </Button>

      <Button
        variant="secondary"
        onClick={() => toast.notify("Sofía Herrera ya está en tu padrón.")}
      >
        Toast de confirmación
      </Button>

      <Button
        variant="secondary"
        onClick={() =>
          toast.notify("Pago registrado", {
            description: "Marzo 2026 · Árabe intermedio · $20.000",
            actionProps: { children: "Compartir comprobante" },
          })
        }
      >
        Toast con acción
      </Button>

      <Button
        variant="secondary"
        onClick={() =>
          toast.error("No pudimos guardar el alumno — no se registró nada.", {
            description: "Revisá la conexión y probá de nuevo.",
          })
        }
      >
        Toast de error (no se auto-cierra)
      </Button>

      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        title="Nuevo alumno"
        description="Con el nombre alcanza. El resto lo completás cuando puedas."
      >
        <ActionSheetBody className="flex flex-col gap-4 pb-4">
          <Field label="Nombre y apellido">
            <Input placeholder="Sofía Herrera" />
          </Field>
          <Field label="WhatsApp" helpText="Opcional. Con código de área, sin el 15.">
            <Input type="tel" inputMode="tel" placeholder="11 5555-4433" />
          </Field>
        </ActionSheetBody>

        <ActionSheetFooter>
          <Button size="lg" onClick={() => setOpen(false)}>
            Guardar alumno
          </Button>
        </ActionSheetFooter>
      </ActionSheet>
    </div>
  );
}

export function OverlaysDemo() {
  return (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  );
}
