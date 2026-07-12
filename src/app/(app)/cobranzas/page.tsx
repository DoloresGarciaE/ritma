import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { AppBar } from "../_components/app-bar";
import { EmptyState } from "../_components/empty-state";

export const metadata: Metadata = {
  title: "Cobranzas · Ritma",
};

/** Placeholder: cuotas, pagos y comprobantes son F1·S3–S5. */
export default function CobranzasPage() {
  return (
    <>
      <AppBar title="Cobranzas" />

      <EmptyState
        icon={Wallet}
        title="No hay nada por cobrar"
        description="Cuando tengas alumnos con cuotas, acá vas a ver quién debe qué, y vas a registrar los pagos en segundos."
      />
    </>
  );
}
