"use client";

import { Check, Plus } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AmountInput, Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { GroupListItem } from "@/server/services/groups";

import {
  createDisciplineAction,
  createGroupAction,
  setGroupActiveAction,
  updateGroupAction,
} from "../actions";
import { groupSchema, toGroupFieldErrors, type GroupFormState } from "../schema";
import { newSlotDraft, SlotEditor, type SlotDraft } from "./slot-editor";

/**
 * Crear/editar grupo — HU3.1, desde el FAB de la Agenda (y desde la lista de Grupos).
 *
 * Nombre, disciplina como chips (elegir o crear al vuelo), tarifa de referencia y el
 * editor de franjas (§3.15). En edición, además, el switch "Grupo activo" — que aplica
 * AL INSTANTE (§3.2), por eso no es parte del submit.
 *
 * El estado inicial sale del `group` al montar: el padre re-montea con `key` cada vez
 * que abre (para un grupo distinto o para crear), así nunca hay draft viejo.
 */

const chipStyles = (selected: boolean) =>
  cn(
    "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
    selected
      ? "border-primary bg-nav-active-bg text-nav-active-text"
      : "border-border-strong bg-surface text-text hover:bg-muted",
  );

export function GroupSheet({
  open,
  onOpenChange,
  disciplines,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disciplines: { id: string; name: string }[];
  /** `null` = crear. Con grupo = editar. */
  group: GroupListItem | null;
}) {
  const toast = useToast();
  const [pending, startSubmit] = useTransition();
  const [togglingActive, startToggleActive] = useTransition();
  const [creatingDiscipline, startCreateDiscipline] = useTransition();

  const [name, setName] = useState(group?.name ?? "");
  const [disciplineId, setDisciplineId] = useState(group?.discipline.id ?? "");
  const [price, setPrice] = useState<number | null>(group?.defaultPrice ?? null);
  const [slots, setSlots] = useState<SlotDraft[]>(() =>
    group ? group.slots.map((slot) => ({ key: slot.id, ...slot })) : [newSlotDraft()],
  );
  const [active, setActive] = useState(group?.active ?? true);

  // Disciplinas creadas al vuelo en esta sesión del sheet, encima de las del server.
  const [extraDisciplines, setExtraDisciplines] = useState<{ id: string; name: string }[]>([]);
  const [newDisciplineOpen, setNewDisciplineOpen] = useState(false);
  const [newDisciplineName, setNewDisciplineName] = useState("");
  const [disciplineError, setDisciplineError] = useState<string | null>(null);

  const [errors, setErrors] = useState<NonNullable<GroupFormState["errors"]>>({});
  const [discardOpen, setDiscardOpen] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const fieldErrorId = useId();

  const allDisciplines = [
    ...disciplines,
    ...extraDisciplines.filter((extra) => !disciplines.some((d) => d.id === extra.id)),
  ];

  const buildInput = () => ({
    name,
    disciplineId,
    defaultPrice: price,
    slots: slots.map(({ id, weekday, startTime, durationMin }) => ({
      id,
      weekday,
      startTime,
      durationMin,
    })),
  });

  // §3.8: cerrar con cambios sin guardar pide confirmación. El snapshot inicial se toma
  // al montar (el padre re-montea con key en cada apertura, así que siempre es fresco).
  // El switch "Grupo activo" no cuenta: aplica al instante, no es un cambio pendiente.
  const initialInput = useRef(JSON.stringify(buildInput()));
  const isDirty = () => JSON.stringify(buildInput()) !== initialInput.current;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDirty()) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  // El mismo aviso que el detalle de sesión: un rechazo de action (datos viejos, red,
  // membresía revocada) no puede tirar la app entera.
  const actionFailedToast = () =>
    toast.error("No se pudo guardar. Revisá la conexión y probá de nuevo.");

  // El CTA nunca se deshabilita por errores (Componentes §4.1): al tocarlo valida y
  // lleva el foco (o la vista) al primer problema.
  const handleSubmit = () => {
    const result = groupSchema.safeParse(buildInput());

    if (!result.success) {
      const found = toGroupFieldErrors(result.error) ?? {};
      setErrors(found);
      if (found.name) nameRef.current?.focus();
      return;
    }

    setErrors({});

    startSubmit(async () => {
      const savedName = result.data.name;
      let state;
      try {
        state = group
          ? await updateGroupAction(group.id, buildInput())
          : await createGroupAction(buildInput());
      } catch {
        actionFailedToast();
        return;
      }

      if (state.errors || state.formError) {
        setErrors(state.errors ?? {});
        if (state.formError) toast.error(state.formError);
        return;
      }

      // Directo al padre (no handleOpenChange): lo guardado ya no es "cambio sin guardar".
      onOpenChange(false);
      toast.notify(group ? `Guardaste ${savedName}` : `Creaste ${savedName}`);
    });
  };

  const handleCreateDiscipline = () => {
    const trimmed = newDisciplineName.trim();
    if (trimmed === "") {
      setDisciplineError("Poné el nombre de la disciplina.");
      return;
    }

    startCreateDiscipline(async () => {
      let created;
      try {
        created = await createDisciplineAction(trimmed);
      } catch {
        actionFailedToast();
        return;
      }

      if ("error" in created) {
        setDisciplineError(created.error);
        return;
      }

      setExtraDisciplines((prev) =>
        prev.some((d) => d.id === created.id) ? prev : [...prev, created],
      );
      setDisciplineId(created.id);
      setDisciplineError(null);
      setNewDisciplineName("");
      setNewDisciplineOpen(false);
      if (errors.disciplineId) setErrors((prev) => ({ ...prev, disciplineId: undefined }));
    });
  };

  const handleToggleActive = (next: boolean) => {
    if (!group) return;
    setActive(next);

    startToggleActive(async () => {
      try {
        await setGroupActiveAction(group.id, next);
      } catch {
        // Optimista con rollback: el switch no puede quedar mintiendo un estado que el
        // server no tiene.
        setActive(!next);
        actionFailedToast();
        return;
      }
      toast.notify(next ? `${group.name} vuelve a tu agenda` : `${group.name} salió de tu agenda`);
    });
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={group ? "Editar grupo" : "Nuevo grupo"}
      description={
        group
          ? "Los cambios de horario valen para todas las semanas."
          : "Un grupo es una clase con su horario. Sus clases se generan solas."
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ActionSheetBody className="flex flex-col gap-4 pb-4">
          <Field label="Nombre del grupo" error={errors.name}>
            <Input
              ref={nameRef}
              autoFocus={!group}
              enterKeyHint="next"
              maxLength={80}
              placeholder="Árabe intermedio"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">Disciplina</span>
            <div
              role="group"
              aria-label="Disciplina"
              aria-describedby={errors.disciplineId ? `${fieldErrorId}-disciplina` : undefined}
              className="flex flex-wrap gap-2"
            >
              {allDisciplines.map((discipline) => {
                const selected = disciplineId === discipline.id;
                return (
                  <button
                    key={discipline.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setDisciplineId(discipline.id);
                      if (errors.disciplineId)
                        setErrors((prev) => ({ ...prev, disciplineId: undefined }));
                    }}
                    className={chipStyles(selected)}
                  >
                    {selected ? <Check aria-hidden className="size-4" /> : null}
                    {discipline.name}
                  </button>
                );
              })}
              <button
                type="button"
                aria-expanded={newDisciplineOpen}
                onClick={() => setNewDisciplineOpen((prev) => !prev)}
                className={chipStyles(false)}
              >
                <Plus aria-hidden className="size-4" />
                Nueva
              </button>
            </div>

            {newDisciplineOpen ? (
              <div className="mt-1 flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    aria-label="Nombre de la disciplina nueva"
                    placeholder="Folklore"
                    maxLength={40}
                    value={newDisciplineName}
                    onChange={(event) => {
                      setNewDisciplineName(event.target.value);
                      if (disciplineError) setDisciplineError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleCreateDiscipline();
                      }
                    }}
                  />
                  {disciplineError ? (
                    <p className="mt-1 text-xs text-danger">{disciplineError}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  loading={creatingDiscipline}
                  onClick={handleCreateDiscipline}
                >
                  Agregar
                </Button>
              </div>
            ) : null}

            {errors.disciplineId ? (
              <p id={`${fieldErrorId}-disciplina`} className="text-xs text-danger">
                {errors.disciplineId}
              </p>
            ) : null}
          </div>

          <Field
            label="Tarifa de referencia"
            helpText="El precio sugerido al inscribir. Después lo ajustás por alumno."
            error={errors.defaultPrice}
          >
            <AmountInput
              value={price}
              onValueChange={(value) => {
                setPrice(value);
                if (errors.defaultPrice)
                  setErrors((prev) => ({ ...prev, defaultPrice: undefined }));
              }}
            />
          </Field>

          <SlotEditor
            slots={slots}
            onChange={(next) => {
              setSlots(next);
              if (errors.slots) setErrors((prev) => ({ ...prev, slots: undefined }));
            }}
            error={errors.slots}
            showEditWarning={group !== null}
          />

          {group ? (
            <div className="flex items-center justify-between rounded-card border border-border bg-surface p-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text">Grupo activo</span>
                <span className="text-xs text-text-secondary">
                  {active ? "Aparece en tu agenda." : "No aparece en tu agenda."}
                </span>
              </div>
              <Switch
                checked={active}
                onCheckedChange={handleToggleActive}
                disabled={togglingActive}
                aria-label="Grupo activo"
              />
            </div>
          ) : null}
        </ActionSheetBody>

        <ActionSheetFooter>
          <Button type="submit" size="lg" loading={pending}>
            {group ? "Guardar cambios" : "Crear grupo"}
          </Button>
        </ActionSheetFooter>
      </form>

      {/* §3.8: cerrar con cambios sin guardar pide confirmación. */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>¿Descartar los cambios?</DialogTitle>
          <DialogDescription>Lo que escribiste en este grupo se pierde.</DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              onClick={() => {
                setDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Descartar
            </Button>
            <DialogClose
              render={
                <Button variant="ghost" size="lg" className="w-full">
                  Seguir editando
                </Button>
              }
            />
          </div>
        </DialogContent>
      </Dialog>
    </ActionSheet>
  );
}
