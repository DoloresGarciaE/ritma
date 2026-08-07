import "server-only";

import { cache } from "react";

import { dbToCivil } from "@/lib/dates";
import { forPublic } from "@/lib/db";
import type { PayMethod } from "@/generated/prisma/client";

/**
 * La superficie pública de Ritma (S5): comprobantes por token, y NADA más.
 *
 * `/r/[token]` no tiene sesión ni organización — la autorización ES el token (opaco,
 * 192 bits, revocable rotándolo). Por eso este módulo es la única excepción de lint que
 * puede usar `forPublic()`, y su contrato es deliberadamente mínimo:
 *
 * - Un único accesor, lookup por el índice único `receiptToken`.
 * - Devuelve EXACTAMENTE lo que Marca §9.1 pone en la pieza: org, alumno, concepto,
 *   período, monto, método y fecha. Sin ids, sin adjuntos, sin historial, sin contacto.
 * - Token desconocido → null (la ruta responde 404 genérico: no se aprende ni si existe).
 */

export type PublicReceipt = {
  orgName: string;
  studentName: string;
  /** Al borde y para mostrar: el número sale de un Decimal ya inmutable. */
  amount: number;
  currency: string;
  method: PayMethod;
  /** Fecha civil del pago ("yyyy-MM-dd", RN10). */
  paidAt: string;
  /**
   * Qué cubrió el pago, vía sus imputaciones (el "concepto" y "período" de §9.1). Puede
   * estar vacío: un pago que quedó todo a favor todavía no cubre ninguna cuota — y como
   * el comprobante es un link vivo (Plan §10, decisión 3), aparece acá solo cuando el
   * crédito se aplique.
   */
  items: { period: string; groupName: string }[];
};

/** `cache()`: la page, `generateMetadata` y la imagen OG comparten el mismo lookup. */
export const getReceiptByToken = cache(async (token: string): Promise<PublicReceipt | null> => {
  // Guarda barata contra basura: los tokens reales miden 32 chars (24 bytes base64url).
  if (!token || token.length > 64) return null;

  const payment = await forPublic().payment.findUnique({
    where: { receiptToken: token },
    select: {
      amount: true,
      currency: true,
      method: true,
      paidAt: true,
      org: { select: { name: true } },
      student: { select: { name: true } },
      allocations: {
        select: {
          charge: {
            select: {
              period: true,
              enrollment: { select: { group: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!payment) return null;

  const items = payment.allocations
    .map((allocation) => ({
      period: allocation.charge.period,
      groupName: allocation.charge.enrollment.group.name,
    }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.groupName.localeCompare(b.groupName));

  return {
    orgName: payment.org.name,
    studentName: payment.student.name,
    amount: payment.amount.toNumber(),
    currency: payment.currency,
    method: payment.method,
    paidAt: dbToCivil(payment.paidAt),
    items,
  };
});
