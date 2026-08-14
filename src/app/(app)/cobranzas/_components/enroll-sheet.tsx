"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AmountInput, Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { normalizeForSearch } from "@/lib/students";
import { cn } from "@/lib/utils";

import { createStudentAction } from "../../alumnos/actions";
import { createEnrollmentAction, enrollManyAction } from "../actions";
import { enrollSchema, toEnrollFieldErrors, type EnrollFormState } from "../schema";

/**
 * Inscribir (HU4.1) — el sheet §3.8 compartido por los DOS orígenes:
 * - ficha del alumno: `student` fijo, se elige el grupo (chips, como las disciplinas) y se
 *   inscribe de a uno;
 * - desde el grupo: `group` fijo y se eligen VARIOS alumnos de una vez (ticket de
 *   inscripción múltiple) con la búsqueda EN LÍNEA de §3.2 (insensible a tildes, la misma
 *   de HU2.2): un padrón tiene docenas y un select simple no sirve; un sheet sobre otro
 *   sheet, tampoco — por eso el alumno que todavía no existe se crea DESDE la lista, con
 *   el alta express de S1, y vuelve ya seleccionado.
 *
 * La tanda comparte plan, precio y fecha de alta: son condiciones del grupo, no del alumno
 * (decisión del ticket). Una excepción por alumno se hace inscribiéndolo solo desde su
 * ficha, o editando su cuota después (RN2).
 *
 * El precio hereda la tarifa del grupo y es editable (CA de HU4.1): se sincroniza con el
 * grupo elegido hasta que la profe lo toca. La fecha de alta define desde qué período se
 * generan cuotas; default: hoy (el de la ZONA de la org).
 *
 * El padre re-montea con `key` en cada apertura: nunca hay draft viejo (patrón S2).
 */

export type EnrollGroupOption = { id: string; name: string; defaultPrice: number };
export type EnrollStudentOption = { id: string; name: string };

const chipStyles = (selected: boolean) =>
  cn(
    "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
    selected
      ? "border-primary bg-nav-active-bg text-nav-active-text"
      : "border-border-strong bg-surface text-text hover:bg-muted",
  );

const PLAN_HELP: Record<"MONTHLY" | "DROP_IN", string> = {
  MONTHLY: "Se genera una cuota por mes, con vencimiento el día de tu organización.",
  DROP_IN: "Un solo cargo, con vencimiento a los 7 días.",
};

export function EnrollSheet({
  open,
  onOpenChange,
  student,
  group,
  groups = [],
  students = [],
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Origen ficha: alumno fijo + selector de grupo. */
  student?: EnrollStudentOption;
  /** Origen sesión: grupo fijo + selector de alumno. */
  group?: EnrollGroupOption;
  groups?: EnrollGroupOption[];
  students?: EnrollStudentOption[];
  /** Hoy en la zona de la org: el default de la fecha de alta. */
  today: string;
}) {
  const toast = useToast();
  const [pending, startSubmit] = useTransition();

  // Con el grupo fijo se inscribe de a varios; con el alumno fijo, de a uno (el flujo de S3
  // intacto). Es lo único que separa los dos modos.
  const multi = Boolean(group);

  const [studentId, setStudentId] = useState(student?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [creating, startCreate] = useTransition();
  const [groupId, setGroupId] = useState(group?.id ?? "");
  const searchRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<"MONTHLY" | "DROP_IN">("MONTHLY");
  const [price, setPrice] = useState<number | null>(group?.defaultPrice ?? null);
  const [priceTouched, setPriceTouched] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [errors, setErrors] = useState<NonNullable<EnrollFormState["errors"]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const groupOptions = group ? [group] : groups;
  const selectedGroup = groupOptions.find((g) => g.id === groupId);
  const selectedStudent = student ?? students.find((s) => s.id === studentId);
  // Los recién creados por el alta express se suman acá: la página todavía no revalidó.
  const [extraStudents, setExtraStudents] = useState<EnrollStudentOption[]>([]);
  const allStudents = [...extraStudents, ...students];
  const filteredStudents = allStudents.filter((option) =>
    normalizeForSearch(option.name).includes(normalizeForSearch(studentQuery)),
  );
  const pickedNames = picked
    .map((id) => allStudents.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const toggle = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (errors.studentId) setErrors((prev) => ({ ...prev, studentId: undefined }));
  };

  /** Alta express (HU2.1) sin salir de la tanda: se crea y queda tildado. */
  const createAndPick = () => {
    const name = studentQuery.trim();
    if (!name) return;

    startCreate(async () => {
      const state = await createStudentAction({ name, phone: "" });

      if (state.errors?.name || !state.id) {
        setErrors((prev) => ({
          ...prev,
          studentId: state.errors?.name ?? "No pudimos crear al alumno. Probá de nuevo.",
        }));
        return;
      }

      setExtraStudents((prev) => [{ id: state.id!, name }, ...prev]);
      setPicked((prev) => [...prev, state.id!]);
      setStudentQuery("");
      setErrors((prev) => ({ ...prev, studentId: undefined }));
      toast.notify(`Guardaste a ${name}`);
    });
  };

  const pickGroup = (option: EnrollGroupOption) => {
    setGroupId(option.id);
    // La tarifa sigue al grupo hasta que la profe la pisa a mano.
    if (!priceTouched) setPrice(option.defaultPrice);
    if (errors.groupId) setErrors((prev) => ({ ...prev, groupId: undefined }));
  };

  /** La tanda: N inscripciones en una sola operación (o entran todas o ninguna). */
  const handleSubmitMany = () => {
    // El CTA nunca se deshabilita (§4.1): sin selección, el tap explica y lleva el foco.
    if (picked.length === 0) {
      setErrors((prev) => ({ ...prev, studentId: "Elegí al menos un alumno." }));
      searchRef.current?.focus();
      return;
    }

    const input = { studentIds: picked, groupId, plan, price, startDate };
    const parsed = enrollSchema.omit({ studentId: true }).safeParse(input);
    if (!parsed.success) {
      setErrors(toEnrollFieldErrors(parsed.error) ?? {});
      return;
    }
    setErrors({});
    setFormError(null);

    const count = picked.length;
    const names = pickedNames;

    startSubmit(async () => {
      let state: Awaited<ReturnType<typeof enrollManyAction>>;
      try {
        state = await enrollManyAction(input);
      } catch {
        onOpenChange(false);
        toast.error("No se pudieron guardar las inscripciones. Actualizá y probá de nuevo.");
        return;
      }

      if (state.errors || state.formError) {
        setErrors(state.errors ?? {});
        setFormError(state.formError ?? null);
        return;
      }

      onOpenChange(false);
      // Con uno solo, la frase nombra al alumno (como el flujo individual); con varios, el
      // número — nombrar a cinco no entra en un toast (§3.9).
      toast.notify(
        count === 1
          ? `Inscribiste a ${names[0]} en ${selectedGroup?.name ?? "el grupo"}.`
          : `Inscribiste a ${count} alumnos en ${selectedGroup?.name ?? "el grupo"}.`,
      );
    });
  };

  const handleSubmit = () => {
    const input = { studentId, groupId, plan, price, startDate };
    const parsed = enrollSchema.safeParse(input);

    if (!parsed.success) {
      setErrors(toEnrollFieldErrors(parsed.error) ?? {});
      return;
    }
    setErrors({});
    setFormError(null);

    startSubmit(async () => {
      let state: EnrollFormState;
      try {
        state = await createEnrollmentAction(input);
      } catch {
        onOpenChange(false);
        toast.error("No se pudo guardar la inscripción. Actualizá y probá de nuevo.");
        return;
      }

      if (state.errors || state.formError) {
        setErrors(state.errors ?? {});
        setFormError(state.formError ?? null);
        return;
      }

      onOpenChange(false);
      toast.notify(
        `Inscribiste a ${selectedStudent?.name ?? "el alumno"} en ${selectedGroup?.name ?? "el grupo"}.`,
      );
    });
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title={student ? `Inscribir a ${student.name}` : "Inscribir alumnos"}
      description={group ? group.name : undefined}
    >
      <ActionSheetBody className="flex flex-col gap-4 pb-4">
        {multi ? (
          <Field
            label={`Alumnos${picked.length > 0 ? ` · ${picked.length} seleccionados` : ""}`}
            error={errors.studentId}
          >
            <div className="flex flex-col gap-2">
              <Input
                ref={searchRef}
                type="search"
                placeholder="Buscá por nombre…"
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
              />
              <ul className="max-h-64 overflow-y-auto rounded-control border border-border">
                {filteredStudents.map((option) => {
                  const checked = picked.includes(option.id);
                  return (
                    <li key={option.id} className="border-b border-border last:border-b-0">
                      {/* La fila entera es el objetivo táctil (§2.3), no el cuadradito. */}
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-text hover:bg-muted">
                        <Checkbox checked={checked} onCheckedChange={() => toggle(option.id)} />
                        <span className="truncate">{option.name}</span>
                      </label>
                    </li>
                  );
                })}

                {allStudents.length === 0 ? (
                  <li className="px-3 py-2.5 text-sm text-text-secondary">
                    No queda nadie sin inscribir en este grupo.
                  </li>
                ) : filteredStudents.length === 0 ? (
                  <li className="flex flex-col items-start gap-2 px-3 py-2.5">
                    <span className="text-sm text-text-secondary">
                      Nadie se llama así en tu padrón.
                    </span>
                    {studentQuery.trim() ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={creating}
                        onClick={createAndPick}
                      >
                        Crear a {studentQuery.trim()}
                      </Button>
                    ) : null}
                  </li>
                ) : null}
              </ul>
            </div>
          </Field>
        ) : student ? null : selectedStudent ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">Alumno</span>
            <div className="flex items-center justify-between gap-2">
              <span className={chipStyles(true)}>{selectedStudent.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStudentId("");
                  setStudentQuery("");
                }}
              >
                Cambiar
              </Button>
            </div>
          </div>
        ) : (
          <Field label="Alumno" error={errors.studentId}>
            <div className="flex flex-col gap-2">
              <Input
                type="search"
                placeholder="Buscá por nombre…"
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
              />
              <ul className="max-h-48 overflow-y-auto rounded-control border border-border">
                {filteredStudents.map((option) => (
                  <li key={option.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => {
                        setStudentId(option.id);
                        if (errors.studentId)
                          setErrors((prev) => ({ ...prev, studentId: undefined }));
                      }}
                      className="flex min-h-11 w-full cursor-pointer items-center px-3 text-left text-sm text-text hover:bg-muted"
                    >
                      {option.name}
                    </button>
                  </li>
                ))}
                {students.length === 0 ? (
                  <li className="px-3 py-2.5 text-sm text-text-secondary">
                    No queda nadie sin inscribir en este grupo.
                  </li>
                ) : filteredStudents.length === 0 ? (
                  <li className="px-3 py-2.5 text-sm text-text-secondary">
                    Nadie se llama así en tu padrón.
                  </li>
                ) : null}
              </ul>
            </div>
          </Field>
        )}

        {group ? null : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">Grupo</span>
            <div className="flex flex-wrap gap-2">
              {groupOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={groupId === option.id}
                  onClick={() => pickGroup(option)}
                  className={chipStyles(groupId === option.id)}
                >
                  {option.name}
                </button>
              ))}
            </div>
            {errors.groupId ? <p className="text-xs text-danger">{errors.groupId}</p> : null}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Plan</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={plan === "MONTHLY"}
              onClick={() => setPlan("MONTHLY")}
              className={chipStyles(plan === "MONTHLY")}
            >
              Mensual
            </button>
            <button
              type="button"
              aria-pressed={plan === "DROP_IN"}
              onClick={() => setPlan("DROP_IN")}
              className={chipStyles(plan === "DROP_IN")}
            >
              Clase suelta
            </button>
          </div>
        </div>

        <Field label="Precio" helpText={PLAN_HELP[plan]} error={errors.price}>
          <AmountInput
            value={price}
            onValueChange={(value) => {
              setPrice(value);
              setPriceTouched(true);
              if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
            }}
          />
        </Field>

        <Field
          label="Fecha de alta"
          helpText="Define desde qué mes se generan las cuotas."
          error={errors.startDate}
        >
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={cn(
              "h-11 w-full rounded-control border border-border-strong bg-surface px-3",
              "text-base text-text",
              "aria-invalid:border-danger",
            )}
            aria-invalid={errors.startDate ? true : undefined}
          />
        </Field>

        {formError ? <p className="text-sm text-danger">{formError}</p> : null}
      </ActionSheetBody>

      <ActionSheetFooter>
        <Button size="lg" loading={pending} onClick={multi ? handleSubmitMany : handleSubmit}>
          {!multi || picked.length === 0
            ? "Inscribir"
            : picked.length === 1
              ? "Inscribir 1 alumno"
              : `Inscribir ${picked.length} alumnos`}
        </Button>
      </ActionSheetFooter>
    </ActionSheet>
  );
}
