"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AmountInput, Field } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { createEnrollmentAction } from "../actions";
import { enrollSchema, toEnrollFieldErrors, type EnrollFormState } from "../schema";

/**
 * Inscribir alumno (HU4.1) — el sheet §3.8 compartido por los DOS orígenes:
 * - ficha del alumno: `student` fijo, se elige el grupo (chips);
 * - detalle de sesión: `group` fijo, se elige el alumno (select nativo: un padrón puede
 *   tener docenas — la rueda del sistema es lo correcto para el pulgar, como §3.15).
 *
 * El precio hereda la tarifa del grupo y es editable POR ALUMNO (CA de HU4.1): se
 * sincroniza con el grupo elegido hasta que la profe lo toca. La fecha de alta define
 * desde qué período se generan cuotas; default: hoy (el de la ZONA de la org).
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

  const [studentId, setStudentId] = useState(student?.id ?? "");
  const [groupId, setGroupId] = useState(group?.id ?? "");
  const [plan, setPlan] = useState<"MONTHLY" | "DROP_IN">("MONTHLY");
  const [price, setPrice] = useState<number | null>(group?.defaultPrice ?? null);
  const [priceTouched, setPriceTouched] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [errors, setErrors] = useState<NonNullable<EnrollFormState["errors"]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const groupOptions = group ? [group] : groups;
  const selectedGroup = groupOptions.find((g) => g.id === groupId);
  const selectedStudent = student ?? students.find((s) => s.id === studentId);

  const pickGroup = (option: EnrollGroupOption) => {
    setGroupId(option.id);
    // La tarifa sigue al grupo hasta que la profe la pisa a mano.
    if (!priceTouched) setPrice(option.defaultPrice);
    if (errors.groupId) setErrors((prev) => ({ ...prev, groupId: undefined }));
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
      title={student ? `Inscribir a ${student.name}` : "Inscribir alumno"}
      description={group ? group.name : undefined}
    >
      <ActionSheetBody className="flex flex-col gap-4 pb-4">
        {student ? null : (
          <Field label="Alumno" error={errors.studentId}>
            <select
              value={studentId}
              onChange={(event) => {
                setStudentId(event.target.value);
                if (errors.studentId) setErrors((prev) => ({ ...prev, studentId: undefined }));
              }}
              className={cn(
                "h-11 w-full rounded-control border border-border-strong bg-surface px-3",
                "text-base text-text",
                "aria-invalid:border-danger",
              )}
              aria-invalid={errors.studentId ? true : undefined}
            >
              <option value="">Elegí un alumno…</option>
              {students.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
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
        <Button size="lg" loading={pending} onClick={handleSubmit}>
          Inscribir
        </Button>
      </ActionSheetFooter>
    </ActionSheet>
  );
}
