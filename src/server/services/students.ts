import { withOrg } from "@/lib/db";
import { normalizeForSearch } from "@/lib/students";

/**
 * Servicios de alumnos (HU2.1–2.3, RN9).
 *
 * Todo pasa por `withOrg(orgId)`: el `orgId` sale del `activeOrgId` de la sesión (nunca de
 * la URL ni de un input) y el cliente lo inyecta y lo filtra solo. Un `orgId` ajeno acá no
 * devuelve nada ni escribe nada — está probado en tests/isolation.test.ts.
 *
 * Reciben datos YA validados (el Zod vive en la ruta, compartido con el formulario) y el
 * teléfono YA en E.164.
 */

/** Lo que la lista necesita de cada alumno. Se selecciona explícito: nada de traer de más. */
export type StudentListItem = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
};

export type StudentDetail = StudentListItem & {
  email: string | null;
  note: string | null;
};

const LIST_FIELDS = { id: true, name: true, phone: true, active: true } as const;
const DETAIL_FIELDS = { ...LIST_FIELDS, email: true, note: true } as const;

export type StudentInput = {
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
};

/**
 * El padrón, con búsqueda y filtro.
 *
 * - `query`: insensible a mayúsculas y acentos, porque compara contra `searchName`, que ya
 *   está normalizado (ver lib/students.ts). Buscar "peña" encuentra "Pena" y al revés.
 * - `includeInactive`: por defecto la lista muestra solo activos (RN9: quien está de baja
 *   deja de aparecer en las listas activas, pero su ficha sigue existiendo).
 *
 * Orden: alfabético por el nombre normalizado, así "Álvarez" no se va al final.
 */
export async function listStudents(
  orgId: string,
  options: { query?: string; includeInactive?: boolean } = {},
): Promise<StudentListItem[]> {
  const query = normalizeForSearch(options.query ?? "");

  return withOrg(orgId).student.findMany({
    where: {
      ...(options.includeInactive ? {} : { active: true }),
      ...(query ? { searchName: { contains: query } } : {}),
    },
    orderBy: { searchName: "asc" },
    select: LIST_FIELDS,
  });
}

/** La ficha. `null` si no existe O si es de otra organización (withOrg no la deja ver). */
export async function getStudent(orgId: string, studentId: string): Promise<StudentDetail | null> {
  return withOrg(orgId).student.findUnique({
    where: { id: studentId },
    select: DETAIL_FIELDS,
  });
}

/** Alta (HU2.1). El alta express manda solo nombre y teléfono; el resto llega en null. */
export async function createStudent(orgId: string, input: StudentInput): Promise<{ id: string }> {
  return withOrg(orgId).student.create({
    data: {
      orgId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      note: input.note,
      searchName: normalizeForSearch(input.name),
    },
    select: { id: true },
  });
}

/** Edición de la ficha. `searchName` se recalcula acá: nunca puede quedar desfasado. */
export async function updateStudent(
  orgId: string,
  studentId: string,
  input: StudentInput,
): Promise<{ id: string }> {
  return withOrg(orgId).student.update({
    where: { id: studentId },
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      note: input.note,
      searchName: normalizeForSearch(input.name),
    },
    select: { id: true },
  });
}

/**
 * Baja de alumno (HU2.3, RN9): **lógica**. `active = false` y nada más.
 *
 * No se borra ni una fila: el alumno desaparece de las listas activas pero su ficha y su
 * historial de pagos quedan consultables para siempre. Cuando existan las cuotas (S3), acá
 * se sumará "no generar cuotas futuras" — hoy no hay nada que dejar de generar.
 */
export async function deactivateStudent(orgId: string, studentId: string): Promise<void> {
  await withOrg(orgId).student.update({
    where: { id: studentId },
    data: { active: false },
    select: { id: true },
  });
}

/** Reactivar: vuelve al padrón activo, con todo su historial intacto. */
export async function reactivateStudent(orgId: string, studentId: string): Promise<void> {
  await withOrg(orgId).student.update({
    where: { id: studentId },
    data: { active: true },
    select: { id: true },
  });
}
