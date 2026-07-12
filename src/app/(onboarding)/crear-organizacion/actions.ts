"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

import {
  createOrgSchema,
  normalizeDiscipline,
  toFieldErrors,
  type CreateOrgInput,
  type CreateOrgState,
} from "./schema";

export async function createOrganization(
  _prev: CreateOrgState,
  input: CreateOrgInput,
): Promise<CreateOrgState> {
  // El usuario sale de la sesión, nunca del cliente.
  const session = await requireSession();

  // Idempotencia: doble submit, dos pestañas, volver atrás y reenviar. Si ya hay
  // organización, no se crea otra.
  if (session.activeOrgId) redirect("/dashboard", "replace");

  // Los errores se DEVUELVEN como estado. Si tiráramos, se los comería el error boundary
  // y el usuario vería una pantalla de error en vez del mensaje en su campo.
  const parsed = createOrgSchema.safeParse(input);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  const { name, type, disciplines } = parsed.data;

  // El unique de Discipline distingue mayúsculas ("Canto" ≠ "canto"): deduplicamos acá
  // para que no entren dos veces disfrazadas.
  const uniqueDisciplines = [
    ...new Map(disciplines.map((d) => [d.toLowerCase(), normalizeDiscipline(d)])).values(),
  ];

  // Una escritura anidada es UNA transacción (BEGIN…COMMIT sobre una sola conexión). No
  // usamos $transaction interactiva: mantendría la conexión tomada entre round-trips, y
  // contra el pooler de Neon eso es buscar problemas.
  // La moneda, el día de vencimiento y la zona horaria salen de los defaults del schema
  // (ARS, 10, America/Argentina/Buenos_Aires — HU1.2).
  await db.organization.create({
    data: {
      name,
      type,
      memberships: { create: { userId: session.userId, role: "OWNER" } },
      disciplines: {
        createMany: {
          data: uniqueDisciplines.map((discipline) => ({ name: discipline })),
          skipDuplicates: true,
        },
      },
    },
    select: { id: true },
  });

  // El servidor ya ve la organización nueva (activeOrgId se recalcula en cada
  // getSession()). Lo que puede estar viejo es el cache del router del cliente: si guardó
  // un /dashboard de cuando el usuario no tenía org —que resolvía en "andá al wizard"—,
  // volveríamos al wizard, el wizard nos mandaría al dashboard, y así al infinito.
  revalidatePath("/", "layout");

  // Fuera de cualquier try/catch: redirect() lanza NEXT_REDIRECT. Con "replace" el wizard
  // no queda en el historial.
  redirect("/dashboard", "replace");
}
