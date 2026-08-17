"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { Field, Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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

export function AuthForm({
  mode,
  googleEnabled,
  socialError,
  next,
}: {
  mode: Mode;
  googleEnabled: boolean;
  /** Lo que dejó el viaje a Google en `?error=`, ya traducido (lo resuelve la page). */
  socialError?: string | null;
  /**
   * A dónde volver después de entrar (S7: la invitación). Ya viene SANEADO por la page
   * (`safeInternalPath`): solo paths internos. Con `next`, el destino le gana a
   * `resolveLanding` en los dos modos — quien se registra para aceptar una invitación
   * NO pasa por el wizard: se está sumando a una org que ya existe.
   */
  next?: string | null;
}) {
  const router = useRouter();
  const { cta, action, fields } = COPY[mode];

  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Mientras el navegador se va a Google no hay nada que esperar acá, pero el botón deja
  // de aceptar clics: dos viajes simultáneos dejarían dos states de OAuth pisándose.
  const [googleLoading, setGoogleLoading] = useState(false);

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
    // Al iniciar sesión el destino no se adivina acá: lo resuelve la raíz con la sesión ya
    // validada (`resolveLanding`) — el MISMO camino que usa el ingreso con Google.
    // Con `next` (la invitación, S7), el destino ya se sabe: se vuelve ahí.
    router.push(next ?? (mode === "registro" ? "/crear-organizacion" : "/"));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {socialError ? (
        <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-text">
          {socialError}
        </p>
      ) : null}

      {googleEnabled ? (
        <>
          <GoogleButton
            disabled={loading || googleLoading}
            onClick={() => {
              setGoogleLoading(true);
              // El flujo es una redirección de página completa: esta promesa no vuelve con
              // el error de Google (para entonces el navegador ya se fue). Lo que falle
              // vuelve como `?error=` a errorCallbackURL, y lo lee la página de login.
              void authClient.signIn.social({
                provider: "google",
                // Entrada unificada: el destino lo decide `resolveLanding` en el server,
                // igual que para email+contraseña. Sin org, la raíz manda al wizard.
                // Con `next` (la invitación, S7), Google también desemboca ahí.
                callbackURL: next ?? "/",
                // Vuelve a la pantalla desde la que salió, con el motivo en `?error=`
                // (y con el `next` intacto: el reintento no pierde la invitación).
                errorCallbackURL:
                  (mode === "registro" ? "/registro" : "/login") +
                  (next ? `?next=${encodeURIComponent(next)}` : ""),
              });
            }}
          />
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
          <PasswordInput
            ref={passwordRef}
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

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={loading}
          disabled={googleLoading}
        >
          {cta}
        </Button>
      </form>
    </div>
  );
}
