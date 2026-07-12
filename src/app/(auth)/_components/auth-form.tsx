"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { toAuthFormError, type AuthField } from "@/lib/auth-errors";

const email = z
  .string()
  .trim()
  .min(1, "Ingresá tu email.")
  .pipe(z.email("Ese email no parece válido. Revisá que esté bien escrito."));

const SCHEMAS = {
  login: z.object({
    email,
    password: z.string().min(1, "Ingresá tu contraseña."),
  }),
  registro: z.object({
    name: z.string().trim().min(1, "Ingresá tu nombre."),
    email,
    password: z.string().min(8, "La contraseña necesita al menos 8 caracteres."),
  }),
};

type Mode = keyof typeof SCHEMAS;
type Errors = Partial<Record<AuthField, string>>;

const COPY = {
  login: {
    cta: "Iniciar sesión",
    action: "iniciar sesión" as const,
    fields: ["email", "password"] as AuthField[],
  },
  registro: {
    cta: "Crear cuenta",
    action: "crear la cuenta" as const,
    fields: ["name", "email", "password"] as AuthField[],
  },
};

export function AuthForm({ mode, googleEnabled }: { mode: Mode; googleEnabled: boolean }) {
  const router = useRouter();
  const { cta, action, fields } = COPY[mode];

  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Solo se llama desde handlers, nunca durante el render.
  const focusField = (field: AuthField) => {
    const target = { name: nameRef, email: emailRef, password: passwordRef }[field];
    target.current?.focus();
  };

  const validate = (only?: AuthField): Errors => {
    const result = SCHEMAS[mode].safeParse(values);
    if (result.success) return {};

    const found: Errors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as AuthField;
      if (!only || field === only) found[field] ??= issue.message;
    }
    return found;
  };

  // Se valida al salir del campo y al enviar, nunca al tipear (Componentes §4.1).
  const handleBlur = (field: AuthField) => {
    const found = validate(field);
    setErrors((prev) => ({ ...prev, [field]: found[field] }));
  };

  const handleChange = (field: AuthField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Al corregir, el error desaparece; no aparece uno nuevo hasta el próximo blur.
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    // El CTA nunca se deshabilita por errores: al tocarlo, lleva el foco al
    // primer campo inválido (Componentes §4.1).
    const found = validate();
    setErrors(found);

    const firstInvalid = fields.find((field) => found[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setLoading(true);

    const { error } =
      mode === "login"
        ? await authClient.signIn.email({ email: values.email, password: values.password })
        : await authClient.signUp.email({
            name: values.name,
            email: values.email,
            password: values.password,
          });

    if (error) {
      const { field, message } = toAuthFormError(error.code, action);
      if (field) {
        setErrors({ [field]: message });
        focusField(field);
      } else {
        setFormError(message);
      }
      setLoading(false);
      return;
    }

    // Quien se acaba de registrar no tiene organización: va derecho al wizard. Pasar por
    // /dashboard sería un rebote, y ese rebote es lo que deja una entrada envenenada en el
    // cache del router (la de "dashboard = andá al wizard").
    // Al iniciar sesión, el layout de (app) decide: si no hay org, manda al wizard igual.
    router.push(mode === "registro" ? "/crear-organizacion" : "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {googleEnabled ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() =>
              authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })
            }
          >
            Continuar con Google
          </Button>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-text-secondary">o</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "registro" ? (
          <Field label="Nombre y apellido" error={errors.name}>
            <Input
              ref={nameRef}
              autoComplete="name"
              placeholder="Malena Ríos"
              value={values.name}
              onChange={(event) => handleChange("name", event.target.value)}
              onBlur={() => handleBlur("name")}
            />
          </Field>
        ) : null}

        <Field label="Email" error={errors.email}>
          <Input
            ref={emailRef}
            type="email"
            autoComplete="email"
            placeholder="malena@ritma.com.ar"
            value={values.email}
            onChange={(event) => handleChange("email", event.target.value)}
            onBlur={() => handleBlur("email")}
          />
        </Field>

        <Field
          label="Contraseña"
          error={errors.password}
          helpText={mode === "registro" ? "Mínimo 8 caracteres." : undefined}
        >
          <Input
            ref={passwordRef}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={values.password}
            onChange={(event) => handleChange("password", event.target.value)}
            onBlur={() => handleBlur("password")}
          />
        </Field>

        {formError ? (
          <p role="alert" className="text-xs text-danger">
            {formError}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {cta}
        </Button>
      </form>
    </div>
  );
}
