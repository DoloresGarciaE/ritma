import type { Metadata } from "next";

import { requireSession } from "@/lib/auth";
import { requireScopedMember } from "@/server/authz";
import { listStudents } from "@/server/services/students";

import { AppBar } from "../_components/app-bar";
import { StudentsScreen } from "./_components/students-screen";

export const metadata: Metadata = {
  title: "Alumnos",
};

/**
 * El padrón (HU2.1–2.3). La primera carga viene del servidor —el padrón activo completo,
 * o para un TEACHER sus alumnos (S7)— y a partir de ahí la búsqueda la maneja el cliente
 * contra la server action, con el mismo scope.
 *
 * La membresía ya la revalidó el layout de `(app)`; las mutaciones la revalidan por su cuenta,
 * porque las server actions NO pasan por el layout.
 */
export default async function AlumnosPage() {
  const session = await requireSession();
  const { scope } = await requireScopedMember(session.activeOrgId!);
  const students = await listStudents(session.activeOrgId!, scope);

  return (
    <>
      <AppBar title="Alumnos" />
      <StudentsScreen initialStudents={students} />
    </>
  );
}
