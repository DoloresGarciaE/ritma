"use client";

import { useState } from "react";

import { SlotEditor, type FranjaDraft } from "../../(app)/agenda/_components/slot-editor";

/**
 * El editor de franjas (§3.15) necesita estado para probarse: chips de día multi-select,
 * duración con "Otra", resumen en vivo. Datos del dominio real, como todo /dev/ui.
 */
export function SlotEditorDemo() {
  const [franjas, setFranjas] = useState<FranjaDraft[]>([
    {
      key: "demo-mar-jue",
      days: [
        { weekday: 2, slotId: "demo-martes" },
        { weekday: 4, slotId: "demo-jueves" },
      ],
      startTime: "19:00",
      durationMin: 90,
      originalDays: [
        { weekday: 2, slotId: "demo-martes" },
        { weekday: 4, slotId: "demo-jueves" },
      ],
    },
    {
      key: "demo-sabado",
      days: [{ weekday: 6, slotId: "demo-sabado" }],
      startTime: "10:00",
      durationMin: 60,
      originalDays: [{ weekday: 6, slotId: "demo-sabado" }],
    },
  ]);

  return <SlotEditor franjas={franjas} onChange={setFranjas} showEditWarning />;
}
