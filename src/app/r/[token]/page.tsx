import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RitmaIsotipo } from "@/components/brand/ritma-isotipo";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDocumentDate, formatMoney, formatPeriod } from "@/lib/format";
import { getReceiptByToken, type PublicReceipt } from "@/server/public/receipts";

/**
 * El comprobante público (HU5.1, Marca §9.1): la pieza más vista por personas ajenas al
 * producto — el embajador de la marca.
 *
 * - Sin sesión, sin org, sin shell: la autorización es el token (ver server/public/).
 *   Token inválido → 404 genérico, que no confirma ni niega nada.
 * - SOLO modo claro (Color §5): fondo blanco fijo vía `.light`, decida lo que decida el
 *   sistema del que abre el link.
 * - Muestra EXACTAMENTE lo que §9.1 define — nada de adjuntos, historial ni contacto
 *   (decisión de privacidad S5: quien tiene el link ve el comprobante, por eso se puede
 *   revocar). `noindex` acá y en robots.ts.
 */

const METHOD_LABEL: Record<PublicReceipt["method"], string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

/** `["a"]` → `"a"` · `["a","b"]` → `"a y b"` · `["a","b","c"]` → `"a, b y c"`. */
function joinEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** El "concepto" de §9.1: los grupos que cubrió el pago; sin imputaciones, a cuenta. */
function conceptOf(receipt: PublicReceipt): string {
  const groups = unique(receipt.items.map((item) => item.groupName));
  return groups.length ? joinEs(groups) : "Pago a cuenta";
}

/** El "período" de §9.1: `"Marzo 2026"`, o `null` si el pago quedó todo a cuenta. */
function periodOf(receipt: PublicReceipt): string | null {
  const periods = unique(receipt.items.map((item) => formatPeriod(item.period)));
  return periods.length ? joinEs(periods) : null;
}

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const receipt = await getReceiptByToken(token);
  // El 404 real lo responde la page; los metadatos del caso inexistente no dicen nada.
  if (!receipt) return { title: "Comprobante", robots: { index: false, follow: false } };

  const period = periodOf(receipt);
  const description = [period, formatMoney(receipt.amount)].filter(Boolean).join(" · ");

  return {
    title: `Comprobante · ${receipt.orgName}`,
    description,
    robots: { index: false, follow: false },
    // El preview del chat (HU5.1): org como título, período y monto como bajada. La
    // imagen la aporta `opengraph-image.tsx` en este mismo segmento (file-based gana).
    openGraph: {
      title: receipt.orgName,
      description: `Comprobante · ${description}`,
      siteName: "Ritma",
      type: "website",
    },
  };
}

export default async function ReceiptPage({ params }: Props) {
  const { token } = await params;
  const receipt = await getReceiptByToken(token);
  if (!receipt) notFound();

  const period = periodOf(receipt);
  const details: [string, string][] = [
    ["Alumno", receipt.studentName],
    ["Concepto", conceptOf(receipt)],
    ...(period ? ([["Período", period]] as [string, string][]) : []),
    ["Método", METHOD_LABEL[receipt.method]],
    ["Fecha", formatDocumentDate(receipt.paidAt)],
  ];

  return (
    <main className="light min-h-dvh bg-surface text-text">
      <article className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-6 py-8">
        {/* La org es la protagonista; Ritma firma discreto en el pie (§9.1). */}
        <header className="flex items-center gap-3">
          <RitmaIsotipo className="h-7" />
          <h1 className="font-display text-xl font-medium">{receipt.orgName}</h1>
        </header>

        <section>
          <p className="text-sm text-text-secondary">Recibimos tu pago</p>
          {/* El monto es el elemento más grande de la pieza (Marca §7, regla 4). */}
          <p className="mt-1 font-display text-5xl font-bold tracking-tight tabular-nums">
            {formatMoney(receipt.amount)}
          </p>
          <div className="mt-4">
            <StatusBadge status="PAID" dot />
          </div>
        </section>

        <dl className="divide-y divide-border border-y border-border text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="shrink-0 text-text-secondary">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        {/* El pie es deliberado (§9.1): nunca se quita, nunca crece de tamaño. */}
        <footer className="mt-auto pt-2">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <RitmaIsotipo className="h-4" />
            Generado con Ritma
          </Link>
        </footer>
      </article>
    </main>
  );
}
