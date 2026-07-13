import type { Role } from "@/generated/prisma/client";

/**
 * Política de permisos por rol: traducción LITERAL de la matriz del Plan §4.
 *
 * Función pura, sin base ni sesión (Plan §10, decisión 2): se testea sola. Cada
 * capacidad es UNA fila de la tabla; no hay ninguna que no esté en la spec. Si hace
 * falta una nueva, primero se versiona el Plan §4 y después se agrega acá.
 *
 * Nota: la matriz da a OWNER y ADMIN exactamente los mismos permisos (todas las filas
 * ✔/✔). No es un descuido: hoy la única diferencia entre ambos es semántica (el dueño),
 * no de capacidades. `requireRole` distingue por rol cuando haga falta.
 */
export const CAPABILITIES = {
  /** Configurar organización, acuerdos y precios. */
  "org:configure": ["OWNER", "ADMIN"],
  /** Invitar usuarios y asignar roles. */
  "members:manage": ["OWNER", "ADMIN"],
  /** Ver TODA la agenda, alumnos y pagos de la org (el teacher ve solo su scope). */
  "org:viewAll": ["OWNER", "ADMIN"],
  /** Gestionar espacios y alquileres. */
  "spaces:manage": ["OWNER", "ADMIN"],
  /** Generar y cerrar liquidaciones. */
  "settlements:manage": ["OWNER", "ADMIN"],
  /** Ver la liquidación propia (el teacher "solo ve la propia"; owner/admin ven todas). */
  "settlements:viewOwn": ["OWNER", "ADMIN", "TEACHER"],
  /** Gestionar SUS grupos, horarios y sesiones. */
  "groups:manage": ["OWNER", "ADMIN", "TEACHER"],
  /** Gestionar SUS alumnos e inscripciones. */
  "students:manage": ["OWNER", "ADMIN", "TEACHER"],
  /** Registrar pagos y compartir comprobantes de SUS alumnos. */
  "payments:manage": ["OWNER", "ADMIN", "TEACHER"],
  /** Enviar recordatorios a SUS alumnos. */
  "reminders:send": ["OWNER", "ADMIN", "TEACHER"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

/**
 * El actor de toda operación de negocio. Sale de `Membership` (revalidada contra la
 * base), NO del `activeOrgId` de la sesión, que es solo contexto (Plan §10, decisión 7).
 */
export type Actor = { userId: string; orgId: string; role: Role };

/** ¿El rol tiene esta capacidad? Mitad de la autorización: el scope se chequea aparte. */
export function can(actor: Actor, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(actor.role);
}

/**
 * El alcance de datos de un actor dentro de su organización.
 *
 * `all` — owner/admin ven todo. `ownTeacher` — el teacher ve "sus grupos y los alumnos
 * inscriptos en ellos" (regla transversal del §4). Hoy NO existen esos modelos
 * (ClassGroup/Enrollment llegan en S2/S3), así que `scopeOf` devuelve un VALOR que
 * describe el alcance —testeable hoy, es función del rol— y S2 lo consume para armar el
 * `where`. No hay abstracción vacía: esta capa no toca la base.
 */
export type Scope = { kind: "all" } | { kind: "ownTeacher"; teacherUserId: string };

export function scopeOf(actor: Actor): Scope {
  return can(actor, "org:viewAll")
    ? { kind: "all" }
    : { kind: "ownTeacher", teacherUserId: actor.userId };
}

/** Se lanza cuando el rol del actor no alcanza para la operación pedida. */
export class ForbiddenError extends Error {
  constructor(message = "No tenés permiso para esta acción.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Exige que el actor tenga uno de los roles permitidos; si no, lanza `ForbiddenError`.
 * Función pura (decide sobre datos, no toca la base): la usa `requireRole` después de
 * resolver la membresía.
 */
export function assertRole(actor: Actor, allowed: readonly Role[]): void {
  if (!allowed.includes(actor.role)) {
    throw new ForbiddenError(
      `El rol ${actor.role} no puede realizar esta acción (requiere: ${allowed.join(", ")}).`,
    );
  }
}
