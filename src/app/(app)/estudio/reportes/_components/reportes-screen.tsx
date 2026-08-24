"use client";

import { BarChart3, ChevronLeft, ChevronRight, Download } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { addMonths } from "@/lib/dates";
import { formatMoney, formatPeriod } from "@/lib/format";
import type { PeriodRevenue, RevenueRow } from "@/server/services/metrics";

/**
 * Reportes (S10, HU7.2, §3.12): dos tablas —por profe y por disciplina— que colapsan a
 * filas simples en mobile, con totales que CUADRAN contra el Inicio (misma vara S6), la
 * línea de alquileres cobrados, y un CSV por reporte (server-side, §4.2). La pantalla
 * no suma nada: todo llega sumado del servicio.
 */

export function ReportesScreen({
  revenue,
  currentPeriod,
}: {
  revenue: PeriodRevenue;
  currentPeriod: string;
}) {
  const { period } = revenue;

  const href = (target: string) =>
    `/estudio/reportes${target === currentPeriod ? "" : `?periodo=${target}`}`;

  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      <nav aria-label="Cambiar de período" className="flex items-center gap-2">
        <Link
          href={href(addMonths(period, -1))}
          aria-label="Período anterior"
          className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <span className="min-w-0 flex-1 truncate text-center font-display text-sm font-medium text-text">
          {formatPeriod(period)}
          {period === currentPeriod ? " · en curso" : ""}
        </span>
        <Link
          href={href(addMonths(period, 1))}
          aria-label="Período siguiente"
          className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
        >
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      </nav>

      {revenue.total === 0 && revenue.rentalsCollected === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <BarChart3 aria-hidden className="size-12 text-text-muted" />
          <h2 className="font-display text-lg font-medium text-text">Sin ingresos este período</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Cuando entren pagos de {formatPeriod(period)}, acá se ve de quién y de qué disciplina
            vienen.
          </p>
        </div>
      ) : (
        <>
          <RevenueTable
            title="Ingresos por profe"
            rows={revenue.byTeacher}
            total={revenue.total}
            csvHref={`/estudio/reportes/csv?tipo=profe&periodo=${period}`}
          />
          <RevenueTable
            title="Ingresos por disciplina"
            rows={revenue.byDiscipline}
            total={revenue.total}
            csvHref={`/estudio/reportes/csv?tipo=disciplina&periodo=${period}`}
          />

          {/* Los alquileres van APARTE: no son cobranza de alumnos (RN7/RN13). */}
          <Card className="flex items-baseline justify-between p-4">
            <span className="text-sm text-text-secondary">Alquileres cobrados del período</span>
            <span className="font-display font-medium text-text tabular-nums">
              {formatMoney(revenue.rentalsCollected)}
            </span>
          </Card>
        </>
      )}
    </div>
  );
}

function RevenueTable({
  title,
  rows,
  total,
  csvHref,
}: {
  title: string;
  rows: RevenueRow[];
  total: number;
  csvHref: string;
}) {
  return (
    <Card className="flex flex-col gap-0 p-0">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h2 className="text-xs font-medium tracking-wide text-text-secondary">{title}</h2>
        {/* El CSV se arma server-side (UTF-8 con BOM): un <a> con download, sin JS. */}
        <a
          href={csvHref}
          download
          className="flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-primary hover:bg-muted"
        >
          <Download aria-hidden className="size-4" />
          CSV
        </a>
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex min-h-11 items-baseline justify-between gap-2 border-t border-border px-4 py-2"
          >
            <span className="min-w-0 truncate text-sm text-text">{row.label}</span>
            <span className="shrink-0 font-display text-sm text-text tabular-nums">
              {formatMoney(row.total)}
            </span>
          </li>
        ))}
        <li className="flex min-h-11 items-baseline justify-between gap-2 border-t border-border px-4 py-2">
          <span className="text-sm font-medium text-text">Total</span>
          <span className="shrink-0 font-display text-sm font-medium text-text tabular-nums">
            {formatMoney(total)}
          </span>
        </li>
      </ul>
    </Card>
  );
}
