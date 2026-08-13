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

/**
 * Errores del flujo social (Google). No llegan por la promesa —el navegador ya se fue a
 * Google— sino como `?error=<código>` sobre el `errorCallbackURL`, así que los lee la
 * página de login, no el formulario. Los códigos los emite Better Auth (o Google, que
 * los pasa verbatim); acá solo traducimos los que un profe puede provocar.
 */
const BY_SOCIAL_CODE: Record<string, string> = {
  // Google devuelve access_denied cuando se rechaza el consentimiento o se vuelve atrás.
  access_denied: "Cancelaste el ingreso con Google. Probá de nuevo o entrá con tu email.",
  // El state de OAuth vive 10 minutos: la pantalla de Google quedó abierta de más.
  state_mismatch: "Pasó demasiado tiempo en la pantalla de Google. Probá de nuevo.",
  state_not_found: "Pasó demasiado tiempo en la pantalla de Google. Probá de nuevo.",
  state_invalid: "Pasó demasiado tiempo en la pantalla de Google. Probá de nuevo.",
  // Con `requireLocalEmailVerified: false` ya no debería pasar; si aparece, es que Google
  // no declaró verificado ese email — y sin esa prueba no vinculamos nada.
  account_not_linked:
    "Ese email ya tiene cuenta en Ritma con contraseña. Entrá con tu email y contraseña.",
  email_not_found: "Google no compartió tu email, así que no podemos crear la cuenta.",
};

/**
 * Mensaje para el `?error=` que dejó el ida y vuelta con Google. `null` si no hay error
 * (o si el código no es de los nuestros y no vale la pena alarmar).
 */
export function toSocialError(code: string | undefined | null): string | null {
  if (!code) return null;

  return (
    BY_SOCIAL_CODE[code] ??
    "No pudimos completar el ingreso con Google — no se guardó nada. Probá de nuevo o entrá con tu email."
  );
}

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
