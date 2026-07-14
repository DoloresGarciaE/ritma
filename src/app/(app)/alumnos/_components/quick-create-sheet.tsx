"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ActionSheet, ActionSheetBody, ActionSheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

import { createStudentAction } from "../actions";
import { quickCreateSchema, toFieldErrors, type StudentField } from "../schema";

/**
 * Alta express — HU2.1: "dar de alta un alumno en segundos, incluso en medio de una clase".
 *
 * Solo nombre y teléfono; el resto se completa después, desde la ficha. Al guardar: toast, el
 * sheet se cierra y el alumno aparece en la lista.
 *
 * Pensado para mínimos taps: el foco arranca en el nombre, el teléfono abre el teclado del
 * teléfono, y Enter guarda.
 */
export function QuickCreateSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [pending, startSubmit] = useTransition();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Partial<Record<StudentField, string>>>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  // El CTA nunca se deshabilita por errores (Componentes §4.1): al tocarlo valida y lleva el
  // foco al primer campo inválido.
  const handleSubmit = () => {
    const result = quickCreateSchema.safeParse({ name, phone });

    if (!result.success) {
      const found = toFieldErrors(result.error) ?? {};
      setErrors(found);
      if (found.name) nameRef.current?.focus();
      else if (found.phone) phoneRef.current?.focus();
      return;
    }

    setErrors({});

    startSubmit(async () => {
      const saved = name.trim();
      const state = await createStudentAction({ name, phone });

      if (state.errors || state.formError) {
        setErrors(state.errors ?? {});
        if (state.formError) toast.error(state.formError);
        return;
      }

      setName("");
      setPhone("");
      onOpenChange(false);
      onCreated();
      toast.notify(`${saved} ya está en tu padrón.`);
    });
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo alumno"
      description="Con el nombre alcanza. El resto lo completás cuando puedas."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ActionSheetBody className="flex flex-col gap-4 pb-4">
          <Field label="Nombre y apellido" error={errors.name}>
            <Input
              ref={nameRef}
              autoFocus
              autoComplete="name"
              enterKeyHint="next"
              maxLength={80}
              placeholder="Sofía Herrera"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
            />
          </Field>

          <Field
            label="WhatsApp"
            helpText="Opcional. Con código de área, sin el 15."
            error={errors.phone}
          >
            <Input
              ref={phoneRef}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="done"
              placeholder="11 5555-4433"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
              }}
            />
          </Field>
        </ActionSheetBody>

        <ActionSheetFooter>
          <Button type="submit" size="lg" loading={pending}>
            Guardar alumno
          </Button>
        </ActionSheetFooter>
      </form>
    </ActionSheet>
  );
}
