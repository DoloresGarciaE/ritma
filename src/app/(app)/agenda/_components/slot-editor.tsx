"use client";

import { Plus, X } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { formatFranja, fullWeekday } from "@/lib/format";
import type { FranjaDay } from "@/lib/franjas";
import { cn } from "@/lib/utils";

/**
 * Editor de franjas — Especificación de componentes §3.15 (HU3.1 + ticket horarios).
 *
 * Una fila por franja MULTI-DÍA: chips de día lunes-primero con toggle por tap
 * (Lun/Mié/Vie al mismo horario = UNA franja), `<input type="time">` (la rueda nativa es
 * lo correcto para el pulgar), duración en pills de valores comunes + "Otra", y el
 * resumen en vivo ("Lun, Mié y Vie · 19:00 · 90 min"). Filas agregables y eliminables;
 * un grupo necesita al menos una.
 *
 * Cada día lleva su `slotId` cuando ya existe: la expansión (lib/franjas) conserva la
 * identidad del slot, que es lo que mantiene vivas las excepciones al cambiar la hora.
 * Destildar un día y arrepentirse EN LA MISMA edición recupera su id (`originalDays`):
 * un mal tap no puede costar historial.
 */

export type FranjaDraft = {
  /** Clave de React para la fila. */
  key: string;
  days: FranjaDay[];
  startTime: string;
  durationMin: number | null;
  /** Los días con que la franja llegó del server: para restaurar ids al re-tildar. */
  originalDays?: FranjaDay[];
};

/** Franja nueva con defaults útiles: el DoD pide crear un grupo en menos de un minuto. */
export function newFranjaDraft(): FranjaDraft {
  return { key: crypto.randomUUID(), days: [{ weekday: 1 }], startTime: "19:00", durationMin: 60 };
}

/** Lunes-primero (RN10: semana lun→dom); el value es la convención JS (0 = domingo). */
const WEEKDAY_CHIPS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
] as const;

const DURATION_PRESETS = [45, 60, 90, 120] as const;

const mondayFirst = (weekday: number) => (weekday + 6) % 7;

const pillStyles = (selected: boolean) =>
  cn(
    "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border px-2 text-sm font-medium transition-[background-color,border-color]",
    selected
      ? "border-primary bg-nav-active-bg text-nav-active-text"
      : "border-border-strong bg-surface text-text hover:bg-muted",
  );

export function SlotEditor({
  franjas,
  onChange,
  error,
  /** En edición: la advertencia fija de §3.15 sobre la pérdida de excepciones. */
  showEditWarning = false,
}: {
  franjas: FranjaDraft[];
  onChange: (franjas: FranjaDraft[]) => void;
  error?: string;
  showEditWarning?: boolean;
}) {
  const patch = (key: string, changes: Partial<FranjaDraft>) => {
    onChange(franjas.map((f) => (f.key === key ? { ...f, ...changes } : f)));
  };

  const toggleDay = (franja: FranjaDraft, weekday: number) => {
    const selected = franja.days.some((day) => day.weekday === weekday);
    const days = selected
      ? franja.days.filter((day) => day.weekday !== weekday)
      : [
          ...franja.days,
          // Si el día ya existía en ESTA franja, vuelve con su id: identidad recuperada.
          franja.originalDays?.find((day) => day.weekday === weekday) ?? { weekday },
        ].sort((a, b) => mondayFirst(a.weekday) - mondayFirst(b.weekday));

    patch(franja.key, { days });
  };

  const errorId = useId();

  return (
    <div
      role="group"
      aria-label="Horarios"
      aria-describedby={error ? errorId : undefined}
      className="flex flex-col gap-3"
    >
      <span className="text-sm font-medium text-text">Horarios</span>

      {franjas.map((franja, index) => {
        const isPreset =
          franja.durationMin !== null &&
          (DURATION_PRESETS as readonly number[]).includes(franja.durationMin);
        const isCustom = franja.durationMin === null || !isPreset;

        return (
          <div
            key={franja.key}
            role="group"
            aria-label={`Franja ${index + 1}`}
            className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-3"
          >
            <div className="flex flex-wrap gap-2" role="group" aria-label="Días de la semana">
              {WEEKDAY_CHIPS.map((day) => {
                const selected = franja.days.some((d) => d.weekday === day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={selected}
                    aria-label={fullWeekday(day.value)}
                    onClick={() => toggleDay(franja, day.value)}
                    className={pillStyles(selected)}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="time"
                aria-label="Hora de inicio"
                value={franja.startTime}
                onChange={(event) => patch(franja.key, { startTime: event.target.value })}
                className="h-11 rounded-control border border-border-strong bg-surface px-3 font-display text-base text-text tabular-nums transition-[border-color]"
              />

              <div
                className="flex flex-1 flex-wrap items-center gap-2"
                role="group"
                aria-label="Duración"
              >
                {DURATION_PRESETS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={franja.durationMin === minutes}
                    onClick={() => patch(franja.key, { durationMin: minutes })}
                    className={pillStyles(franja.durationMin === minutes)}
                  >
                    {minutes}′
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={isCustom}
                  onClick={() => {
                    if (!isCustom) patch(franja.key, { durationMin: null });
                  }}
                  className={pillStyles(isCustom)}
                >
                  Otra
                </button>
                {isCustom ? (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={15}
                    max={480}
                    step={5}
                    aria-label="Duración en minutos"
                    placeholder="min"
                    value={franja.durationMin ?? ""}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      patch(franja.key, { durationMin: Number.isNaN(parsed) ? null : parsed });
                    }}
                    className="h-11 w-20 rounded-control border border-border-strong bg-surface px-3 text-base text-text tabular-nums transition-[border-color]"
                  />
                ) : null}
              </div>

              {franjas.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Eliminar franja ${index + 1}`}
                  icon={<X />}
                  onClick={() => onChange(franjas.filter((f) => f.key !== franja.key))}
                  className="shrink-0"
                />
              ) : null}
            </div>

            {/* El resumen en vivo (§4.2): lo que la profe va a leer en su lista de grupos. */}
            {franja.days.length > 0 && franja.durationMin !== null ? (
              <p className="text-xs text-text-secondary">
                {formatFranja(
                  franja.days.map((day) => day.weekday),
                  franja.startTime,
                  franja.durationMin,
                )}
              </p>
            ) : null}
          </div>
        );
      })}

      <Button
        type="button"
        variant="secondary"
        icon={<Plus />}
        onClick={() => onChange([...franjas, newFranjaDraft()])}
        className="self-start"
      >
        Agregar franja
      </Button>

      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {showEditWarning ? (
        <p className="text-xs text-text-secondary">
          Si eliminás una franja o le sacás un día, se pierden las sesiones canceladas o movidas de
          esos días. Cambiar la hora o la duración las conserva.
        </p>
      ) : null}
    </div>
  );
}
