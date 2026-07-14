import type { Metadata } from "next";

import { requireSession } from "@/lib/auth";
import { listStudents } from "@/server/services/students";

import { AppBar } from "../_components/app-bar";
import { StudentsScreen } from "./_components/students-screen";

export const metadata: Metadata = {
  title: "Alumnos · Ritma",
};

/**
 * El padrón (HU2.1–2.3). La primera carga viene del servidor —el padrón activo completo— y a
 * partir de ahí la búsqueda la maneja el cliente contra la server action.
 *
 * La membresía ya la revalidó el layout de `(app)`; las mutaciones la revalidan por su cuenta,
 * porque las server actions NO pasan por el layout.
 */
export default async function AlumnosPage() {
  const session = await requireSession();
  const students = await listStudents(session.activeOrgId!);

  return (
    <>
      <AppBar title="Alumnos" />
      <StudentsScreen initialStudents={students} />
    </>
  );
}
