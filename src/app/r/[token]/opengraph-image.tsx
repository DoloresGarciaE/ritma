import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { formatMoney, formatPeriod } from "@/lib/format";
import { getReceiptByToken } from "@/server/public/receipts";

/**
 * La imagen del preview de WhatsApp (HU5.1): org, período y monto — y NADA más (ni el
 * alumno: un link reenviado no tiene por qué mostrar quién pagó). Se genera al vuelo por
 * la misma puerta pública que la página; token inválido → 404, sin imagen genérica que
 * confirme nada.
 *
 * Colores fijos porque satori no lee CSS vars: son los tokens del modo claro de Color §8
 * (el comprobante es solo claro, Color §5) — surface #FFFFFF, text #23212F, secondary
 * #625F55, accent #EE6A4D, state-paid #D3EDE0/#115A39. Las fuentes son TTF estáticos
 * commiteados en assets/fonts/ (next/og no puede usar next/font).
 */

export const alt = "Comprobante de pago";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const receipt = await getReceiptByToken(token);
  if (!receipt) return new Response("Not found", { status: 404 });

  const [spaceGrotesk, inter] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/SpaceGrotesk-Bold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-Regular.ttf")),
  ]);

  const periods = [...new Set(receipt.items.map((item) => formatPeriod(item.period)))];
  const subtitle = ["Comprobante de pago", ...periods].join(" · ");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#FFFFFF",
        padding: 72,
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {/* El isotipo oficial (Marca §5.2), trazos del SVG maestro. */}
        <svg viewBox="-2 3 32 56" width="44" height="77">
          <g
            fill="none"
            stroke="#23212F"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 32 V52" />
            <path d="M3 42 A10 10 0 0 1 13 32" />
            <path d="M25 32 V52" />
          </g>
          <circle cx="25" cy="12" r="4.5" fill="#EE6A4D" />
        </svg>
        <div style={{ fontFamily: "Space Grotesk", fontSize: 52, color: "#23212F" }}>
          {receipt.orgName}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 30, color: "#625F55" }}>{subtitle}</div>
        {/* El monto, elemento dominante de la pieza (Marca §7, regla 4). */}
        <div style={{ fontFamily: "Space Grotesk", fontSize: 128, color: "#23212F" }}>
          {formatMoney(receipt.amount)}
        </div>
        <div style={{ display: "flex", marginTop: 8 }}>
          <div
            style={{
              display: "flex",
              backgroundColor: "#D3EDE0",
              color: "#115A39",
              fontSize: 28,
              padding: "10px 28px",
              borderRadius: 999,
            }}
          >
            Pagada
          </div>
        </div>
      </div>

      <div style={{ fontSize: 26, color: "#625F55" }}>Generado con Ritma</div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Space Grotesk", data: spaceGrotesk, weight: 700, style: "normal" },
        { name: "Inter", data: inter, weight: 400, style: "normal" },
      ],
    },
  );
}
