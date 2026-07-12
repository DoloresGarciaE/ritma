/**
 * Traduce los códigos de error de Better Auth a mensajes concretos, en el campo
 * que corresponde (Componentes §3.2, Marca §4.2: nunca "algo salió mal").
 */

export type AuthField = "name" | "email" | "password";

export type AuthFormError = {
  /** `null` cuando el error no es de ningún campo en particular (ej. se cayó la red). */
  field: AuthField | null;
  message: string;
};

/**
 * "El email o la contraseña" y no "la contraseña": no decimos cuál de los dos
 * falló, para no confirmarle a nadie que un email está registrado.
 */
const BY_CODE: Record<string, AuthFormError> = {
  INVALID_EMAIL_OR_PASSWORD: {
    field: "password",
    message: "El email o la contraseña no coinciden. Revisalos y probá de nuevo.",
  },
  USER_NOT_FOUND: {
    field: "password",
    message: "El email o la contraseña no coinciden. Revisalos y probá de nuevo.",
  },
  USER_ALREADY_EXISTS: {
    field: "email",
    message: "Ya hay una cuenta con ese email. Iniciá sesión.",
  },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    field: "email",
    message: "Ya hay una cuenta con ese email. Iniciá sesión.",
  },
  INVALID_EMAIL: {
    field: "email",
    message: "Ese email no parece válido. Revisá que esté bien escrito.",
  },
  PASSWORD_TOO_SHORT: {
    field: "password",
    message: "La contraseña necesita al menos 8 caracteres.",
  },
  PASSWORD_TOO_LONG: {
    field: "password",
    message: "La contraseña no puede tener más de 128 caracteres.",
  },
};

export function toAuthFormError(
  code: string | undefined,
  action: "iniciar sesión" | "crear la cuenta",
): AuthFormError {
  const known = code ? BY_CODE[code] : undefined;
  if (known) return known;

  return {
    field: null,
    message: `No pudimos ${action} — no se guardó nada. Revisá la conexión y probá de nuevo.`,
  };
}
