"use client";

import { ArrowLeft, Check, Plus } from "lucide-react";
import { startTransition, useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { createOrganization } from "./actions";
import {
  createOrgSchema,
  DISCIPLINE_SUGGESTIONS,
  EMPTY_STATE,
  MAX_DISCIPLINE_LENGTH,
  normalizeDiscipline,
  toFieldErrors,
  type CreateOrgField,
  type CreateOrgInput,
} from "./schema";

const STEPS = ["name", "type", "disciplines"] as const;

/** En qué paso vive cada campo: si algo no valida, volvemos ahí. */
const STEP_OF: Record<CreateOrgField, number> = { name: 0, type: 1, disciplines: 2 };

const ORG_TYPE_OPTIONS = [
  {
    value: "INDEPENDENT",
    title: "Trabajo por mi cuenta",
    description: "Das tus clases y cobrás vos. Es lo más común.",
  },
  {
    value: "STUDIO",
    title: "Tengo un estudio",
    description: "Hay varios profes, salones y un reparto de la plata.",
  },
] as const;

export function Wizard() {
  const [state, submit, pending] = useActionState(createOrganization, EMPTY_STATE);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [type, setType] = useState<CreateOrgInput["type"] | null>(null);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<Partial<Record<CreateOrgField, string>>>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const disciplineRef = useRef<HTMLInputElement>(null);

  // Solo se llama desde handlers, nunca durante el render.
  const focusField = (field: CreateOrgField) => {
    if (field === "name") nameRef.current?.focus();
    if (field === "disciplines") disciplineRef.current?.focus();
  };

  const toggleDiscipline = (value: string) => {
    const clean = normalizeDiscipline(value);
    if (!clean) return;

    setErrors((prev) => ({ ...prev, disciplines: undefined }));
    setDisciplines((prev) =>
      prev.some((d) => d.toLowerCase() === clean.toLowerCase())
        ? prev.filter((d) => d.toLowerCase() !== clean.toLowerCase())
        : [...prev, clean],
    );
  };

  const addDraft = () => {
    if (!normalizeDiscipline(draft)) return;
    toggleDiscipline(draft);
    setDraft("");
    disciplineRef.current?.focus();
  };

  const isLastStep = step === STEPS.length - 1;

  // El CTA no se deshabilita nunca por errores (Componentes §4.1): al tocarlo valida,
  // salta al paso del primer campo inválido y le lleva el foco.
  const handleSubmit = () => {
    const result = createOrgSchema.safeParse({ name, type, disciplines });

    if (!result.success) {
      const found = toFieldErrors(result.error) ?? {};
      setErrors(found);

      const firstInvalid = STEPS.find((field) => found[field]);
      if (firstInvalid) {
        setStep(STEP_OF[firstInvalid]);
        // El campo puede no estar montado todavía (cambiamos de paso): esperamos al paint.
        requestAnimationFrame(() => focusField(firstInvalid));
      }
      return;
    }

    setErrors({});
    startTransition(() => submit(result.data));
  };

  const shownErrors = { ...errors, ...state.errors };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-text-secondary">
          Paso {step + 1} de {STEPS.length}
        </p>
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, index) => (
            <span
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                index <= step ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>
      </div>

      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-medium text-text">
              ¿Cómo se llama tu espacio?
            </h1>
            <p className="text-text-secondary">
              Es el nombre que van a ver tus alumnos en los comprobantes.
            </p>
          </header>

          <Field label="Nombre" error={shownErrors.name}>
            <Input
              ref={nameRef}
              autoFocus
              maxLength={60}
              placeholder="Danzas Malena"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
            />
          </Field>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-medium text-text">¿Cómo trabajás?</h1>
            <p className="text-text-secondary">Esto define qué te muestra Ritma.</p>
          </header>

          <div role="radiogroup" aria-label="Tipo de organización" className="flex flex-col gap-3">
            {ORG_TYPE_OPTIONS.map((option) => {
              const selected = type === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setType(option.value);
                    setErrors((prev) => ({ ...prev, type: undefined }));
                  }}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-card border p-4 text-left transition-[background-color,border-color]",
                    selected
                      ? "border-primary bg-nav-active-bg"
                      : "border-border bg-surface hover:bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                      selected ? "border-primary bg-primary" : "border-border-strong",
                    )}
                  >
                    {selected ? <Check className="size-3 text-on-primary" /> : null}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium text-text">{option.title}</span>
                    <span className="text-sm text-text-secondary">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {shownErrors.type ? (
            <p role="alert" className="text-xs text-danger">
              {shownErrors.type}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-medium text-text">¿Qué enseñás?</h1>
            <p className="text-text-secondary">
              Tocá las que dictes o agregá las tuyas. Después vas a poder cambiarlas.
            </p>
          </header>

          <div className="flex flex-wrap gap-2">
            {[
              ...DISCIPLINE_SUGGESTIONS,
              ...disciplines.filter((d) => !DISCIPLINE_SUGGESTIONS.includes(d)),
            ].map((suggestion) => {
              const selected = disciplines.some(
                (d) => d.toLowerCase() === suggestion.toLowerCase(),
              );

              return (
                <button
                  key={suggestion}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleDiscipline(suggestion)}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color]",
                    selected
                      ? "border-primary bg-nav-active-bg text-nav-active-text"
                      : "border-border-strong bg-surface text-text hover:bg-muted",
                  )}
                >
                  {selected ? <Check aria-hidden className="size-4" /> : null}
                  {suggestion}
                </button>
              );
            })}
          </div>

          <Field label="Agregá la tuya" error={shownErrors.disciplines}>
            <div className="flex gap-2">
              <Input
                ref={disciplineRef}
                maxLength={MAX_DISCIPLINE_LENGTH}
                placeholder="Contemporáneo"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addDraft();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="lg"
                icon={<Plus />}
                aria-label="Agregar disciplina"
                onClick={addDraft}
              >
                Agregar
              </Button>
            </div>
          </Field>

          {disciplines.length > 0 ? (
            <p className="text-xs text-text-secondary">
              {disciplines.length === 1
                ? "1 disciplina elegida"
                : `${disciplines.length} disciplinas elegidas`}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.formError ? (
        <p role="alert" className="text-xs text-danger">
          {state.formError}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <Button
          size="lg"
          className="w-full"
          loading={pending}
          onClick={isLastStep ? handleSubmit : () => setStep(step + 1)}
        >
          {isLastStep ? "Crear organización" : "Continuar"}
        </Button>

        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full"
            icon={<ArrowLeft />}
            onClick={() => setStep(step - 1)}
          >
            Volver
          </Button>
        ) : null}
      </div>
    </div>
  );
}
