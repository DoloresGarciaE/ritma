import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getStudent } from "@/server/services/students";

import { AppBar } from "../../_components/app-bar";
import { StudentDetail } from "./_components/student-detail";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession();
  const student = await getStudent(session.activeOrgId!, id);

  return { title: student ? `${student.name} · Ritma` : "Alumno · Ritma" };
}

/**
 * Ficha de alumno v1 (HU2.2 parcial + HU2.3).
 *
 * Hoy: datos editables, notas, y baja/reactivación. Las secciones de inscripciones, estado de
 * cuenta e historial de recordatorios que pide el CA de HU2.2 llegan en S3–S5 — la página está
 * lista para recibirlas debajo, y no se inventan placeholders de algo que todavía no existe.
 *
 * `notFound()` y no un redirect: con el id de un alumno de OTRA organización, `getStudent`
 * devuelve null (withOrg lo filtra) y respondemos 404. Un redirect confirmaría que existe.
 */
export default async function StudentPage({ params }: Params) {
  const { id } = await params;
  const session = await requireSession();
  const student = await getStudent(session.activeOrgId!, id);

  if (!student) notFound();

  return (
    <>
      <AppBar title={student.name} back="/alumnos" />
      <StudentDetail student={student} />
    </>
  );
}
