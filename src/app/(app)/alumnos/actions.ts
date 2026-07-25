"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { requireMember } from "@/server/authz";
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
 * pasar por él. Por eso cada una revalida la membresía con `requireMember`, que devuelve el
 * `Actor` con su `orgId`. El orgId sale SIEMPRE de la sesión, nunca de un input del cliente.
 */
async function currentOrgId(): Promise<string> {
  const session = await requireSession();
  const actor = await requireMember(session.activeOrgId!);
  return actor.orgId;
}

/** Búsqueda al tipear (HU2.2). Es una lectura: no revalida caché ni redirige. */
export async function searchStudentsAction(
  query: string,
  includeInactive: boolean,
): Promise<StudentListItem[]> {
  const orgId = await currentOrgId();
  return listStudents(orgId, { query, includeInactive });
}

/** Alta express (HU2.1): solo nombre y teléfono. */
export async function createStudentAction(input: {
  name: string;
  phone: string;
}): Promise<StudentFormState> {
  const orgId = await currentOrgId();

  // Los errores se DEVUELVEN como estado: si tiráramos, el error boundary se los comería y
  // el profe vería una pantalla de crash en vez del mensaje en su campo (Componentes §4.1).
  const parsed = quickCreateSchema.safeParse(input);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  await createStudent(orgId, {
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: null,
    note: null,
  });

  revalidatePath("/alumnos");
  return {};
}

/** Edición de la ficha completa (HU2.2). */
export async function updateStudentAction(
  studentId: string,
  input: { name: string; phone: string; email: string; note: string },
): Promise<StudentFormState> {
  const orgId = await currentOrgId();

  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  await updateStudent(orgId, studentId, parsed.data);

  revalidatePath("/alumnos");
  revalidatePath(`/alumnos/${studentId}`);
  return {};
}

/** Baja lógica (HU2.3, RN9): el alumno sale de las listas activas, su ficha queda. */
export async function deactivateStudentAction(studentId: string): Promise<void> {
  const orgId = await currentOrgId();
  await deactivateStudent(orgId, studentId);

  revalidatePath("/alumnos");
  revalidatePath(`/alumnos/${studentId}`);
}

export async function reactivateStudentAction(studentId: string): Promise<void> {
  const orgId = await currentOrgId();
  await reactivateStudent(orgId, studentId);

  revalidatePath("/alumnos");
  revalidatePath(`/alumnos/${studentId}`);
}
