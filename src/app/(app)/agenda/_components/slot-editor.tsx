"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fullWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Editor de franjas — Especificación de componentes §3.15 (HU3.1).
 *
 * Una fila por franja: pills de día lunes-primero, `<input type="time">` (la rueda nativa
 * es lo correcto para el pulgar) y duración en pills de valores comunes + "Otra". Filas
 * agregables y eliminables; un grupo necesita al menos una.
 */

export type SlotDraft = {
  /** Clave de React para la fila (las franjas nuevas no tienen id todavía). */
  key: string;
  /** id real de la franja, si ya existe (el diff del servicio la reconoce). */
  id?: string;
  weekday: number;
  startTime: string;
  durationMin: number | null;
};

/** Franja nueva con defaults útiles: el DoD pide crear un grupo en menos de un minuto. */
export function newSlotDraft(): SlotDraft {
  return { key: crypto.randomUUID(), weekday: 1, startTime: "19:00", durationMin: 60 };
}

/** Lunes-primero (RN10: semana lun→dom); el value es la convención JS (0 = domingo). */
const WEEKDAY_PILLS = [
  { value: 1, label: "Lu" },
  { value: 2, label: "Ma" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Ju" },
  { value: 5, label: "Vi" },
  { value: 6, label: "Sá" },
  { value: 0, label: "Do" },
] as const;

const DURATION_PRESETS = [45, 60, 90] as const;

const pillStyles = (selected: boolean) =>
  cn(
    "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border px-2 text-sm font-medium transition-[background-color,border-color]",
    selected
      ? "border-primary bg-nav-active-bg text-nav-active-text"
      : "border-border-strong bg-surface text-text hover:bg-muted",
  );

export function SlotEditor({
  slots,
  onChange,
  error,
  /** En edición: la advertencia fija de §3.15 sobre la pérdida de excepciones. */
  showEditWarning = false,
}: {
  slots: SlotDraft[];
  onChange: (slots: SlotDraft[]) => void;
  error?: string;
  showEditWarning?: boolean;
}) {
  const patch = (key: string, changes: Partial<SlotDraft>) => {
    onChange(slots.map((slot) => (slot.key === key ? { ...slot, ...changes } : slot)));
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-text">Horarios</span>

      {slots.map((slot, index) => {
        const isPreset =
          slot.durationMin !== null &&
          (DURATION_PRESETS as readonly number[]).includes(slot.durationMin);
        const isCustom = slot.durationMin === null || !isPreset;

        return (
          <div
            key={slot.key}
            role="group"
            aria-label={`Franja ${index + 1}`}
            className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-3"
          >
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Día de la semana">
              {WEEKDAY_PILLS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={slot.weekday === day.value}
                  aria-label={fullWeekday(day.value)}
                  onClick={() => patch(slot.key, { weekday: day.value })}
                  className={pillStyles(slot.weekday === day.value)}
                >
                  {day.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="time"
                aria-label="Hora de inicio"
                value={slot.startTime}
                onChange={(event) => patch(slot.key, { startTime: event.target.value })}
                className="h-11 rounded-control border border-border-strong bg-surface px-3 font-display text-base text-text tabular-nums transition-[border-color]"
              />

              <div
                className="flex flex-1 flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Duración"
              >
                {DURATION_PRESETS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={slot.durationMin === minutes}
                    onClick={() => patch(slot.key, { durationMin: minutes })}
                    className={pillStyles(slot.durationMin === minutes)}
                  >
                    {minutes}′
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={isCustom}
                  onClick={() => {
                    if (!isCustom) patch(slot.key, { durationMin: null });
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
                    value={slot.durationMin ?? ""}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      patch(slot.key, { durationMin: Number.isNaN(parsed) ? null : parsed });
                    }}
                    className="h-11 w-20 rounded-control border border-border-strong bg-surface px-3 text-base text-text tabular-nums transition-[border-color]"
                  />
                ) : null}
              </div>

              {slots.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Eliminar franja ${index + 1}`}
                  icon={<X />}
                  onClick={() => onChange(slots.filter((s) => s.key !== slot.key))}
                  className="shrink-0"
                />
              ) : null}
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="secondary"
        icon={<Plus />}
        onClick={() => onChange([...slots, newSlotDraft()])}
        className="self-start"
      >
        Agregar franja
      </Button>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {showEditWarning ? (
        <p className="text-xs text-text-secondary">
          Si eliminás una franja o le cambiás el día, se pierden sus sesiones canceladas o movidas.
          Cambiar la hora o la duración las conserva.
        </p>
      ) : null}
    </div>
  );
}
