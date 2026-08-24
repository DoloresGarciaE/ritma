import { getSession } from "@/lib/auth";
import { isPeriod } from "@/lib/dates";
import { formatMoney, formatPeriod } from "@/lib/format";
import { requireMember } from "@/server/authz";
import { getShellOrganization } from "@/server/organizations";
import { periodRevenue } from "@/server/services/metrics";
import { can } from "@/server/services/permissions";

/**
 * Export CSV de los reportes (S10, HU7.2), armado SERVER-SIDE: refleja exactamente la
 * tabla en pantalla — mismas filas, mismos formatos (§4.2) — sin inventar columnas.
 *
 * - UTF-8 **con BOM**: sin él, Excel abre "Práctica" como mojibake.
 * - Separador `;`: el list separator del Excel en español (es-AR usa coma decimal);
 *   con `,` todo cae en una sola columna.
 * - Un archivo por reporte (`?tipo=profe|disciplina`), nombrado con el período.
 *
 * Un route handler NO pasa por el layout de `(app)`: la guardia va acá — sesión,
 * membresía owner/admin y STUDIO, o 404 que no confirma nada (§4.3).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.activeOrgId) return new Response(null, { status: 404 });

  const orgId = session.activeOrgId;
  const [org, actor] = await Promise.all([getShellOrganization(orgId), requireMember(orgId)]);
  if (org?.type !== "STUDIO" || !can(actor, "settlements:manage")) {
    return new Response(null, { status: 404 });
  }

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  const periodo = url.searchParams.get("periodo");
  if ((tipo !== "profe" && tipo !== "disciplina") || !periodo || !isPeriod(periodo)) {
    return new Response(null, { status: 404 });
  }

  const revenue = await periodRevenue(orgId, periodo);
  const rows = tipo === "profe" ? revenue.byTeacher : revenue.byDiscipline;
  const header = tipo === "profe" ? "Profe" : "Disciplina";

  const lines = [
    `${header};Ingresos de ${formatPeriod(periodo)}`,
    ...rows.map((row) => `${csvCell(row.label)};${csvCell(formatMoney(row.total))}`),
    `Total;${csvCell(formatMoney(revenue.total))}`,
  ];

  // BOM explícito (U+FEFF) + CRLF: lo que Excel espera de un CSV "de Windows".
  const body = "﻿" + lines.join("\r\n") + "\r\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ritma-ingresos-por-${tipo}-${periodo}.csv"`,
    },
  });
}

/** Una celda CSV: comillas solo si hace falta (separador, comillas o saltos adentro). */
function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
