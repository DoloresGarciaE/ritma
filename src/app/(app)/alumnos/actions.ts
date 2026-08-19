"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { requireScopedMember } from "@/server/authz";
import { ForbiddenError, type DataScope } from "@/server/services/permissions";
import {
  createStudent,
  deactivateStudent,
  listStudents,
  reactivateStudent,
  updateStudent,
  type StudentListItem,
} from "@/server/services/students";

import { quickCreateSchema, studentSchema, toFieldErrors, type StudentFormState } from "./schema";

/**
 * Server actions de alumnos.
 *
 * OJO: el layout de `(app)` NO protege las server actions — se invocan por POST directo, sin
 * pasar por él. Por eso cada una revalida membresía Y alcance (S7): el `scope` baja al
 * servicio, que para un TEACHER solo alcanza a SUS alumnos (los inscriptos en sus grupos).
 * El orgId sale SIEMPRE de la sesión, nunca de un input del cliente.
 */
async function currentScoped(): Promise<{ orgId: string; scope: DataScope }> {
  const session = await requireSession();
  // Sin org activa no hay nada que autorizar: el mismo error controlado que "no sos
  // miembro" (un `!` acá dejaría pasar un null a Prisma, que revienta con un 500 crudo).
  if (!session.activeOrgId) throw new ForbiddenError("La sesión no tiene organización activa.");
  const { actor, scope } = await requireScopedMember(session.activeOrgId);
  return { orgId: actor.orgId, scope };
}

/** Búsqueda al tipear (HU2.2). Es una lectura: no revalida caché ni redirige. */
export async function searchStudentsAction(
  query: string,
  includeInactive: boolean,
): Promise<StudentListItem[]> {
  const { orgId, scope } = await currentScoped();
  return listStudents(orgId, scope, { query, includeInactive });
}

/**
 * Alta express (HU2.1): solo nombre y teléfono.
 *
 * Devuelve el `id` del alumno creado para quien lo necesite: el alta express dentro de la
 * inscripción múltiple lo usa para dejarlo YA seleccionado en la tanda.
 *
 * Sin scope a propósito (S7): un alumno recién creado no está inscripto en ningún lado
 * todavía — para un teacher, el camino natural es el alta express DENTRO de inscribir,
 * que lo suma a su grupo en el mismo gesto (hasta inscribirlo, no aparece en sus listas).
 */
export async function createStudentAction(input: {
  name: string;
  phone: string;
}): Promise<StudentFormState & { id?: string }> {
  const { orgId } = await currentScoped();

  // Los errores se DEVUELVEN como estado: si tiráramos, el error boundary se los comería y
  // el profe vería una pantalla de crash en vez del mensaje en su campo (Componentes §4.1).
  const parsed = quickCreateSchema.safeParse(input);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  const created = await createStudent(orgId, {
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: null,
    note: null,
  });

  revalidatePath("/alumnos");
  return { id: created.id };
}

/** Edición de la ficha completa (HU2.2). */
export async function updateStudentAction(
  studentId: string,
  input: { name: string; phone: string; email: string; note: string },
): Promise<StudentFormState> {
  const { orgId, scope } = await currentScoped();

  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  await updateStudent(orgId, scope, studentId, parsed.data);

  revalidatePath("/alumnos");
  revalidatePath(`/alumnos/${studentId}`);
  return {};
}

/** Baja lógica (HU2.3, RN9): el alumno sale de las listas activas, su ficha queda. */
export async function deactivateStudentAction(studentId: string): Promise<void> {
  const { orgId, scope } = await currentScoped();
  await deactivateStudent(orgId, scope, studentId);

  revalidatePath("/alumnos");
  revalidatePath(`/alumnos/${studentId}`);
}

export async function reactivateStudentAction(studentId: string): Promise<void> {
  const { orgId, scope } = await currentScoped();
  await reactivateStudent(orgId, scope, studentId);

  revalidatePath("/alumnos");
  revalidatePath(`/alumnos/${studentId}`);
}
