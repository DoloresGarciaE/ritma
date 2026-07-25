"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/students";
import type { StudentDetail as Student } from "@/server/services/students";

import {
  deactivateStudentAction,
  reactivateStudentAction,
  updateStudentAction,
} from "../../actions";
import { studentSchema, toFieldErrors, type StudentField } from "../../schema";

/**
 * Ficha de alumno v1 (HU2.2 + HU2.3).
 *
 * Los datos son editables en el lugar (no hay un "modo edición"): es un formulario que se
 * guarda con un botón. La baja pide confirmación nombrando al alumno y la consecuencia
 * (Componentes §3.8).
 */
export function StudentDetail({ student }: { student: Student }) {
  const router = useRouter();
  const toast = useToast();

  const [pending, startSubmit] = useTransition();
  const [changingStatus, startStatusChange] = useTransition();

  const [name, setName] = useState(student.name);
  const [phone, setPhone] = useState(student.phone ? formatPhone(student.phone) : "");
  const [email, setEmail] = useState(student.email ?? "");
  const [note, setNote] = useState(student.note ?? "");
  const [errors, setErrors] = useState<Partial<Record<StudentField, string>>>({});

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSubmit = () => {
    const result = studentSchema.safeParse({ name, phone, email, note });

    if (!result.success) {
      setErrors(toFieldErrors(result.error) ?? {});
      return;
    }

    setErrors({});

    startSubmit(async () => {
      const state = await updateStudentAction(student.id, { name, phone, email, note });

      if (state.errors || state.formError) {
        setErrors(state.errors ?? {});
        if (state.formError) toast.error(state.formError);
        return;
      }

      toast.notify("Ficha guardada.");
    });
  };

  const handleDeactivate = () => {
    startStatusChange(async () => {
      await deactivateStudentAction(student.id);
      setConfirmOpen(false);
      toast.notify(`${student.name} quedó dado de baja.`);
      router.refresh();
    });
  };

  const handleReactivate = () => {
    startStatusChange(async () => {
      await reactivateStudentAction(student.id);
      toast.notify(`${student.name} vuelve a estar activo.`);
      router.refresh();
    });
  };

  const shownErrors = errors;

  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      <div className="flex items-center gap-3">
        <Avatar name={student.name} size="lg" />
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate font-display text-xl font-medium text-text">{student.name}</h2>
          <p className="text-sm text-text-secondary">
            {student.active ? "Alumno activo" : "Dado de baja · su historial se conserva"}
          </p>
        </div>
      </div>

      <Card className="flex flex-col gap-4">
        <Field label="Nombre y apellido" error={shownErrors.name}>
          <Input
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="WhatsApp" helpText="Con código de área, sin el 15." error={shownErrors.phone}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="11 5555-4433"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>

        <Field label="Email" error={shownErrors.email}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="sofi@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field
          label="Notas"
          helpText="Lo que quieras recordar: lesiones, preferencias, quién la trae."
          error={shownErrors.note}
        >
          <textarea
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
          />
        </Field>

        <Button size="lg" className="w-full" loading={pending} onClick={handleSubmit}>
          Guardar cambios
        </Button>
      </Card>

      {/*
        Acá abajo van, en sus bloques: inscripciones (S3), estado de cuenta (S3–S4) e
        historial de recordatorios (S5). No se dibujan placeholders de lo que no existe.
      */}

      <Card className="flex flex-col gap-3">
        <h3 className="font-medium text-text">{student.active ? "Dar de baja" : "Reactivar"}</h3>
        <p className="text-sm text-text-secondary">
          {student.active
            ? "Deja de aparecer en tus listas activas, pero su ficha y su historial de pagos quedan intactos. Podés reactivarlo cuando vuelva."
            : "Vuelve a aparecer en tus listas activas, con todo su historial."}
        </p>

        {student.active ? (
          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            onClick={() => setConfirmOpen(true)}
          >
            Dar de baja
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            loading={changingStatus}
            onClick={handleReactivate}
          >
            Reactivar alumno
          </Button>
        )}
      </Card>

      {/* Confirmación destructiva: nombra al alumno y dice la consecuencia (§3.8). */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="gap-4 p-4">
          <DialogTitle>¿Dar de baja a {student.name}?</DialogTitle>
          <DialogDescription>
            Deja de aparecer en tus listas activas. Su ficha y su historial de pagos se conservan, y
            podés reactivarlo cuando quieras.
          </DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={changingStatus}
              onClick={handleDeactivate}
            >
              Dar de baja
            </Button>
            <DialogClose
              render={
                <Button variant="ghost" size="lg" className="w-full">
                  Volver
                </Button>
              }
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
