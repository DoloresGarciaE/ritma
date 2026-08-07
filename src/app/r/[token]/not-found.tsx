import { RitmaIsotipo } from "@/components/brand/ritma-isotipo";

/**
 * 404 GENÉRICO del comprobante: no confirma ni niega que el token haya existido (un link
 * revocado y un token inventado responden exactamente lo mismo). En español y modo claro,
 * como toda la superficie pública.
 */
export default function ReceiptNotFound() {
  return (
    <main className="light min-h-dvh bg-surface text-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-start justify-center gap-3 px-6">
        <RitmaIsotipo className="h-7" />
        <p className="text-lg font-medium">Este link no está disponible.</p>
        <p className="text-sm text-text-secondary">Si te lo compartieron, pedí uno nuevo.</p>
      </div>
    </main>
  );
}
