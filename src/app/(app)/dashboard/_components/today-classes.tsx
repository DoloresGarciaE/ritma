"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { SessionBlock } from "@/components/ui/session-block";

/**
 * Las clases de hoy del dashboard (HU7.1): los MISMOS bloques de sesión de la agenda
 * (§3.7), y tocar cualquiera cae en la vista día de hoy — el "detalle" de esta card.
 * Son botones (no se puede anidar un botón en un Link), por eso este client component.
 */

export type TodayClass = {
  slotId: string;
  originalDate: string;
  startTime: string;
  groupName: string;
  status: "SCHEDULED" | "CANCELLED" | "DONE";
  moved: boolean;
  colorIndex: number;
};

export function TodayClasses({
  classes,
  today,
  dateLabel,
}: {
  classes: TodayClass[];
  today: string;
  dateLabel: string;
}) {
  const router = useRouter();

  if (classes.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        Hoy no tenés clases.{" "}
        <Link href="/agenda" className="font-medium text-primary hover:underline">
          Mirá la semana en la agenda
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {classes.map((session) => (
        <SessionBlock
          key={`${session.slotId}|${session.originalDate}`}
          session={session}
          dateLabel={dateLabel}
          onClick={() => router.push(`/agenda?vista=dia&dia=${today}`)}
        />
      ))}
    </div>
  );
}
