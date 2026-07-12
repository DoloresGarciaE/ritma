import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { AppBar } from "../_components/app-bar";
import { EmptyState } from "../_components/empty-state";

export const metadata: Metadata = {
  title: "Agenda · Ritma",
};

/**
 * Placeholder: la agenda de verdad (grupos, horarios, sesiones) es F1·S2.
 * El CTA de "nuevo grupo" llega con ella; acá no ponemos un botón que no lleve a ningún lado.
 */
export default function AgendaPage() {
  return (
    <>
      <AppBar title="Agenda" />

      <EmptyState
        icon={CalendarDays}
        title="Tu semana está vacía"
        description="Acá va a vivir tu agenda: cada grupo con su horario, y las clases generadas solas. Estamos armándola."
      />
    </>
  );
}
