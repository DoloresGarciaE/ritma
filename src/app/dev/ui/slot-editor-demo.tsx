"use client";

import { useState } from "react";

import { SlotEditor, type SlotDraft } from "../../(app)/agenda/_components/slot-editor";

/**
 * El editor de franjas (§3.15) necesita estado para probarse: filas agregables, pills de
 * día, duración con "Otra". Datos del dominio real, como todo /dev/ui.
 */
export function SlotEditorDemo() {
  const [slots, setSlots] = useState<SlotDraft[]>([
    { key: "demo-martes", id: "demo-martes", weekday: 2, startTime: "19:00", durationMin: 90 },
    { key: "demo-jueves", id: "demo-jueves", weekday: 4, startTime: "19:00", durationMin: 90 },
  ]);

  return <SlotEditor slots={slots} onChange={setSlots} showEditWarning />;
}
