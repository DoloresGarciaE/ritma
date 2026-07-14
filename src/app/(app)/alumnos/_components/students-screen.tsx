"use client";

import { Search, Users } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Fab } from "@/components/ui/fab";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StudentListItem } from "@/server/services/students";

import { EmptyState } from "../../_components/empty-state";
import { searchStudentsAction } from "../actions";
import { QuickCreateSheet } from "./quick-create-sheet";
import { StudentRow } from "./student-row";

/**
 * El padrón (HU2.2): búsqueda con resultados al tipear + filtro activos/todos.
 *
 * La búsqueda va al servidor (la misma que testeamos: insensible a mayúsculas y acentos) con un
 * debounce, para no disparar una query por tecla. Mientras no se busque ni se filtre, lo que se
 * muestra es la lista que ya trajo el server component: no hay parpadeo al entrar, y tras dar de
 * alta un alumno la lista se refresca sola (`revalidatePath`).
 */
const DEBOUNCE_MS = 200;

export function StudentsScreen({ initialStudents }: { initialStudents: StudentListItem[] }) {
  // `null` = "no hay búsqueda en curso": manda lo que vino del servidor.
  const [results, setResults] = useState<StudentListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isSearching, startSearch] = useTransition();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Debounce dirigido por evento (no por efecto): una query por pausa de tipeo. */
  const scheduleSearch = (nextQuery: string, nextIncludeInactive: boolean) => {
    if (timer.current) clearTimeout(timer.current);

    // Sin búsqueda ni filtro no hace falta ir al servidor: ya tenemos la lista fresca.
    if (nextQuery.trim() === "" && !nextIncludeInactive) {
      setResults(null);
      return;
    }

    timer.current = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchStudentsAction(nextQuery, nextIncludeInactive));
      });
    }, DEBOUNCE_MS);
  };

  const students = results ?? initialStudents;
  const searching = query.trim() !== "";

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pt-2 pb-4 md:px-6">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="search"
            enterKeyHint="search"
            aria-label="Buscar alumno"
            placeholder="Buscar por nombre"
            className="pl-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              scheduleSearch(event.target.value, includeInactive);
            }}
          />
        </div>

        {/* Filtro activos / todos. Lo dado de baja no se esconde: se puede pedir (RN9). */}
        <div role="group" aria-label="Filtrar alumnos" className="flex gap-2">
          {(
            [
              { label: "Activos", value: false },
              { label: "Todos", value: true },
            ] as const
          ).map((option) => {
            const selected = includeInactive === option.value;

            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setIncludeInactive(option.value);
                  scheduleSearch(query, option.value);
                }}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
                  selected
                    ? "border-primary bg-nav-active-bg text-nav-active-text"
                    : "border-border-strong bg-surface text-text hover:bg-muted",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {students.length === 0 ? (
        searching ? (
          <EmptyState
            icon={Search}
            title="No encontramos a nadie"
            description={`Ningún alumno coincide con "${query.trim()}". Probá con otra parte del nombre.`}
          />
        ) : (
          <EmptyState
            icon={Users}
            title={includeInactive ? "Tu padrón está vacío" : "Todavía no tenés alumnos activos"}
            description="Cargá tu primer alumno: con el nombre alcanza, el resto lo completás después."
            action={{ label: "Cargar mi primer alumno", onClick: () => setSheetOpen(true) }}
          />
        )
      ) : (
        <ul
          aria-busy={isSearching}
          className="divide-y divide-border border-y border-border bg-surface"
        >
          {students.map((student) => (
            <StudentRow key={student.id} student={student} />
          ))}
        </ul>
      )}

      <Fab label="Nuevo alumno" onClick={() => setSheetOpen(true)} />

      <QuickCreateSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        // Tras el alta, volvemos a la vista limpia: el servidor ya revalidó la lista.
        onCreated={() => {
          setQuery("");
          setIncludeInactive(false);
          setResults(null);
        }}
      />
    </>
  );
}
