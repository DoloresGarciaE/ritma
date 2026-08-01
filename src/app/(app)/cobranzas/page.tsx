import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireSession } from "@/lib/auth";
import { addMonths, DEFAULT_TIMEZONE, isPeriod, periodOf, todayInTz } from "@/lib/dates";
import { formatListDate, formatMoney, formatPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getOrgSettings } from "@/server/organizations";
import { debtorsForPeriod } from "@/server/services/charges";
import { listGroups } from "@/server/services/groups";

import { AppBar } from "../_components/app-bar";
import { EmptyState } from "../_components/empty-state";

export const metadata: Metadata = {
  title: "Cobranzas · Ritma",
};

/**
 * Cobranzas (S3): los deudores del período — una fila por cuota impaga, con alumno,
 * grupo, badge §3.3 y monto; arriba, el total adeudado. Server-first como la agenda:
 * `?periodo=YYYY-MM` y `?grupo=<id>` viven en la URL (params inválidos caen en silencio
 * al período actual / sin filtro). El botón de WhatsApp llega en S5; registrar pagos, S4.
 */
export default async function CobranzasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const orgId = session.activeOrgId!;
  const params = await searchParams;

  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const [settings, groups] = await Promise.all([getOrgSettings(orgId), listGroups(orgId)]);
  const currentPeriod = periodOf(todayInTz(settings?.timezone ?? DEFAULT_TIMEZONE));

  const periodoParam = first(params.periodo);
  const period = periodoParam && isPeriod(periodoParam) ? periodoParam : currentPeriod;

  const grupoParam = first(params.grupo);
  const groupId = groups.some((g) => g.id === grupoParam) ? grupoParam : undefined;

  const { total, debtors } = await debtorsForPeriod(orgId, period, { groupId });

  const href = (p: string, g: string | undefined = groupId) => {
    const query = new URLSearchParams();
    if (p !== currentPeriod) query.set("periodo", p);
    if (g) query.set("grupo", g);
    const qs = query.toString();
    return qs ? `/cobranzas?${qs}` : "/cobranzas";
  };

  const chipStyles = (selected: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
      selected
        ? "border-primary bg-nav-active-bg text-nav-active-text"
        : "border-border-strong bg-surface text-text hover:bg-muted",
    );

  return (
    <>
      <AppBar title="Cobranzas" />

      <div className="flex flex-col gap-3 px-4 pt-2 pb-6 md:px-6">
        {/* ‹ Período › — el estado vive en la URL, como la agenda. */}
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
          </span>

          <Link
            href={href(addMonths(period, 1))}
            aria-label="Período siguiente"
            className="flex size-11 items-center justify-center rounded-control text-text-secondary hover:bg-muted"
          >
            <ChevronRight aria-hidden className="size-5" />
          </Link>

          {period !== currentPeriod ? (
            <Link
              href={href(currentPeriod)}
              className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-primary hover:bg-muted"
            >
              Este mes
            </Link>
          ) : null}
        </nav>

        {/* Filtro por grupo: chips-link. "Todos" = sin filtro. */}
        {groups.length > 1 ? (
          <div
            role="group"
            aria-label="Filtrar por grupo"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            <Link
              href={href(period, undefined)}
              aria-current={!groupId ? "true" : undefined}
              className={chipStyles(!groupId)}
            >
              Todos
            </Link>
            {groups.map((group) => (
              <Link
                key={group.id}
                href={href(period, group.id)}
                aria-current={groupId === group.id ? "true" : undefined}
                className={chipStyles(groupId === group.id)}
              >
                {group.name}
              </Link>
            ))}
          </div>
        ) : null}

        {debtors.length === 0 ? (
          <EmptyState
            icon={PartyPopper}
            title="Nada por cobrar"
            description={`Las cuotas de ${formatPeriod(period).toLowerCase()} están al día. Cuando haya deuda, la vas a ver acá.`}
          />
        ) : (
          <>
            {/* El total adeudado del período, arriba de la lista. */}
            <Card className="flex flex-col gap-0.5">
              <span className="text-xs text-text-secondary">
                Por cobrar en {formatPeriod(period).toLowerCase()}
                {groupId ? ` · ${groups.find((g) => g.id === groupId)?.name}` : ""}
              </span>
              <span className="font-display text-2xl font-medium text-text tabular-nums">
                {formatMoney(total)}
              </span>
              <span className="text-xs text-text-secondary">
                {debtors.length === 1 ? "1 cuota impaga" : `${debtors.length} cuotas impagas`}
              </span>
            </Card>

            {/* Una fila por CUOTA (§3.5): el tap va a la ficha, donde viven las acciones. */}
            <ul className="divide-y divide-border border-y border-border bg-surface">
              {debtors.map((debtor) => (
                <li key={debtor.chargeId}>
                  <Link
                    href={`/alumnos/${debtor.student.id}`}
                    className="flex min-h-16 items-center gap-3 px-4 py-2"
                  >
                    <Avatar name={debtor.student.name} size="md" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-text">{debtor.student.name}</span>
                      <span className="truncate text-xs text-text-secondary">
                        {debtor.group.name} · vence {formatListDate(debtor.dueDate)}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-display text-sm font-medium text-text tabular-nums">
                        {formatMoney(debtor.amount)}
                      </span>
                      <StatusBadge status={debtor.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
