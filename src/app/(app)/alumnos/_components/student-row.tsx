import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { formatPhone } from "@/lib/students";
import type { StudentListItem } from "@/server/services/students";

/**
 * Ítem de lista de alumno — Componentes §3.5.
 *
 * Anatomía: avatar de iniciales · nombre + subtítulo · (zona derecha) · chevron. Altura 64 px,
 * divisor entre ítems. El tap navega a la ficha, y no hay botones por fila: una lista con
 * acciones rápidas por fila se vuelve un campo minado táctil (§3.5).
 *
 * El subtítulo es, por ahora, el teléfono formateado. Los grupos activos llegan en S2.
 * La ZONA DERECHA queda vacía a propósito: los badges de deuda son S3/S4 y no se anticipan.
 */
export function StudentRow({ student }: { student: StudentListItem }) {
  const subtitle = student.phone ? formatPhone(student.phone) : "Sin teléfono";

  return (
    <li>
      <Link
        href={`/alumnos/${student.id}`}
        className="flex min-h-16 items-center gap-3 px-4 transition-colors hover:bg-muted"
      >
        <Avatar name={student.name} />

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-text">{student.name}</span>
            {/* Ningún estado comunica solo con color: la baja se dice con palabras. */}
            {!student.active ? (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                Inactivo
              </span>
            ) : null}
          </span>
          <span className="truncate text-sm text-text-secondary">{subtitle}</span>
        </span>

        <ChevronRight aria-hidden className="size-5 shrink-0 text-text-muted" />
      </Link>
    </li>
  );
}
